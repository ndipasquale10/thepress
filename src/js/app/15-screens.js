const SCREENS = {
  home: {
    id: "home-screen",
    tab: "home",
    enter: () => {
      ((_groupEditMode = !1), renderResumeCard(), renderLiveGames(), renderHome());
    },
  },
  games: {
    id: "games-screen",
    tab: "games",
    enter: () => {
      (renderTheCard(), updateGameOptions(), dockGameOptions(), updateGamesSummary());
    },
  },
  /* enter() stays out of the roster itself -- rebuilding it would trample a
     half-typed name -- but seating the phone's owner only fills a blank slot,
     so the first page of a round always has you on it. */
  setup: {
    id: "setup-screen",
    tab: "games",
    enter: () => {
      seatMe();
    },
  },
  scoring: { id: "scoring-screen", tab: "scoring", chrome: "round", enter: () => {} },
  watch: { id: "watch-screen", chrome: "watch", enter: () => renderWatch() },
  settle: { id: "settle-screen", tab: "settle", enter: () => renderSettle() },
  you: { id: "you-screen", tab: "you", enter: () => renderYou() },
  season: { id: "history-screen", enter: () => renderHistory() },
};
function hideAllScreens() {
  Object.keys(SCREENS).forEach((k) => {
    const e = document.getElementById(SCREENS[k].id);
    e && e.classList.add("hidden");
  });
}
let _currentScreen = "home";
function enterScreen(name, opts) {
  _currentScreen = name;
  opts = opts || {};
  const sc = SCREENS[name];
  if (!sc) return;
  if (isSpectator && "watch" !== name && "function" == typeof exitSpectator) exitSpectator();
  hideAllScreens();
  const hb = document.getElementById("home-btn");
  hb && hb.classList.toggle("hidden", "round" !== sc.chrome);
  const nb = document.getElementById("nav-bar");
  nb && nb.classList.toggle("hidden", "watch" === sc.chrome);
  document.body.classList.toggle("watch-mode", "watch" === sc.chrome);
  setScreenAwake("round" === sc.chrome || "watch" === sc.chrome);
  const sl = document.getElementById("sticky-leaderboard");
  sl && sl.classList.add("hidden");
  const cb = document.getElementById("confirm-bar"),
    _cbOn = "round" === sc.chrome && !isSpectator;
  cb && cb.classList.toggle("hidden", !_cbOn);
  document.body.classList.toggle("confirm-bar-open", _cbOn);
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.screen === sc.tab));
  animateScreenIn(sc.id);
  // A screen change starts at the top of that screen. Without this the old
  // scroll offset carries over, so tapping a tab from halfway down one screen
  // drops you into the middle of the next one.
  _scrollLocked && unlockBodyScroll();
  window.scrollTo(0, 0);
  opts.noPush || history.pushState({ navKind: name }, "");
  updateNavCounts();
  try {
    sc.enter && sc.enter();
  } catch (e) {
    console.error("screen " + name, e);
  }
}
function showScreen(name) {
  if ("scoring" === name && !state.started)
    return void enterScreen(
      getAllRounds().some((r) => !r.finished && r.started) ? "home" : "games",
    );
  enterScreen(name);
}
/* Every "your" surface in the app -- the season card, your take, your nemesis,
   the handicap index, the trophy case, the hole strip -- hangs off this one
   name, and nothing ever wrote it: getPrimaryPlayerName() guessed from round
   history and the app never said so or let you correct it. Score for the group
   on your phone with somebody else typed in first and the whole app quietly
   narrates their season as yours. */
function setPrimaryPlayer(name) {
  const n = String(name || "").trim();
  if (!n) return !1;
  if (!safeSetItem("primaryPlayer", n)) return !1;
  haptic();
  /* Now that the app knows who you are, your own remembered handicap is what
     your roster row should be playing off -- not the 0 a blank slot starts at.
     Naming yourself also outranks having taken an earlier row out, so the
     roster being set up gets you in it. */
  _unseatedMe = !1;
  adoptMyHandicap();
  seatMe();
  /* Repaint whatever is reading the name. The setup screen's enter() seats you
     but deliberately renders nothing else -- it would trample a half-typed
     roster -- so the roster is refreshed by hand here, which is also what
     retires the prompt. */
  try {
    SCREENS[_currentScreen] && SCREENS[_currentScreen].enter && SCREENS[_currentScreen].enter();
  } catch (e) {}
  try {
    document.getElementById("setup-screen").classList.contains("hidden") || renderPlayers();
  } catch (e) {}
  try {
    state.started &&
      !document.getElementById("scoring-screen").classList.contains("hidden") &&
      renderHole();
  } catch (e) {}
  return !0;
}
function primaryPlayerOptionsHTML() {
  const me = getPrimaryPlayerName(),
    names = knownPlayerNames();
  return names.length
    ? names
        .map(
          (n) =>
            '<option value="' +
            esc(n) +
            '"' +
            (n === me ? " selected" : "") +
            ">" +
            esc(n) +
            "</option>",
        )
        .join("")
    : '<option value="">Nobody entered yet</option>';
}
function primaryPlayerIsGuess() {
  try {
    return !localStorage.getItem("primaryPlayer");
  } catch (e) {
    return !0;
  }
}
/* Everyone this phone has ever entered: the saved database, every roster in
   the history, and whoever is in the round being set up. A name stored from an
   older build stays in the list even if it matches nothing, so picking it again
   is always possible. */
function knownPlayerNames() {
  const seen = new Map(),
    add = (n) => {
      const t = String(n || "").trim();
      t && !seen.has(t.toLowerCase()) && seen.set(t.toLowerCase(), t);
    };
  /* "Player 3" is a blank roster slot, not somebody you could be. */
  (state.players || []).forEach((p) => isPlaceholderPlayer(p) || add(p && p.name));
  getSavedProfiles().forEach((p) => add(p && p.name));
  getAllRounds().forEach((r) => ((r && r.players) || []).forEach((p) => add(p && p.name)));
  let stored = null;
  try {
    stored = localStorage.getItem("primaryPlayer");
  } catch (e) {}
  add(stored);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
function getPrimaryPlayerName() {
  let stored = null;
  try {
    stored = localStorage.getItem("primaryPlayer");
  } catch (e) {}
  if (stored) return stored;
  const counts = {};
  getAllRounds().forEach((r) => {
    (r.players || []).forEach((p) => {
      counts[p.name] = (counts[p.name] || 0) + 1;
    });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : (state.players[0] && state.players[0].name) || null;
}
function seasonAgg() {
  const rounds = getAllRounds().filter((r) => r.finished && r.money && r.players),
    agg = {};
  rounds.forEach((r) => {
    (r.players || []).forEach((p, i) => {
      agg[p.name] || (agg[p.name] = { name: p.name, color: p.color, money: 0, rounds: 0, wins: 0 });
      const m = r.money[i] || 0;
      ((agg[p.name].money += m), agg[p.name].rounds++, m > 0.005 && agg[p.name].wins++);
    });
  });
  const hidden = getHiddenPlayers(),
    me = getPrimaryPlayerName();
  const list = Object.values(agg)
    .filter((p) => p.name === me || !hidden.includes(p.name))
    .sort((a, b) => b.money - a.money);
  return {
    rounds: rounds,
    list: list,
    hiddenCount: hidden.filter((n) => agg[n] && n !== me).length,
  };
}
// Season-table row hiding. Removing a player just tucks their name into this
// list; it never touches the stored rounds, so each round stays zero-sum and
// the removal is fully reversible via "Show all".
function getHiddenPlayers() {
  return safeParseJSON(localStorage.getItem("hiddenPlayers"), []);
}
function setHiddenPlayers(a) {
  safeSetItem("hiddenPlayers", JSON.stringify(a));
}
function removeSeasonPlayer(name) {
  const h = getHiddenPlayers();
  h.includes(name) || (h.push(name), setHiddenPlayers(h));
  renderHome();
  showToast(name + " hidden from your season");
}
function showAllSeasonPlayers() {
  setHiddenPlayers([]);
  renderHome();
}
function groupTableCollapsed() {
  return "1" === localStorage.getItem("groupTableCollapsed");
}
function toggleGroupTable() {
  safeSetItem("groupTableCollapsed", groupTableCollapsed() ? "0" : "1");
  _groupEditMode = !1;
  renderHome();
}
function toggleGroupEdit() {
  _groupEditMode = !_groupEditMode;
  renderHome();
}
let _groupEditMode = !1;
// A standings rank chip: gold/silver/bronze medal for the top three, a quiet
// digit past that. Shared so every leaderboard -- home, live watch, settle --
// crowns the leader the same way instead of each screen inventing its own.
function rankChip(n) {
  return '<span class="rank-medal' + (n <= 3 ? " r" + n : " rank-plain") + '">' + n + "</span>";
}
// Chronology for the season story. A round from a partial sync can carry an
// unusable date; sort it to the start rather than letting NaN scramble the order.
function _rTime(r) {
  const t = new Date(r.finishedDate || r.date).getTime();
  return isNaN(t) ? 0 : t;
}
function _myNet(r, name) {
  const i = (r.players || []).findIndex((p) => p.name === name);
  return i < 0 ? null : r.money[i] || 0;
}
// Standing order over an arbitrary slice of rounds, so "where did I move to"
// can be answered by ranking the season twice -- with and without the last round.
function _orderOf(rounds) {
  const a = {};
  rounds.forEach((r) =>
    (r.players || []).forEach((p, i) => {
      a[p.name] = (a[p.name] || 0) + (r.money[i] || 0);
    }),
  );
  return Object.keys(a).sort((x, y) => a[y] - a[x]);
}
// The opponent worth naming: whoever is up on you, else whoever you are up on
// the most. Ties broken by rounds shared, so it is someone you actually play.
function _rivalOf(rounds, me) {
  const s = {};
  rounds.forEach((r) => {
    const my = _myNet(r, me);
    if (null == my) return;
    (r.players || []).forEach((p, i) => {
      if (p.name === me) return;
      const v =
          s[p.name] || (s[p.name] = { name: p.name, color: p.color, n: 0, w: 0, l: 0, diff: 0 }),
        o = r.money[i] || 0;
      (v.n++, (v.diff += my - o), my > o ? v.w++ : my < o && v.l++);
    });
  });
  const l = Object.values(s);
  if (!l.length) return null;
  const behind = l.filter((v) => v.diff < -0.005);
  if (behind.length)
    return Object.assign(behind.sort((a, b) => a.diff - b.diff || b.n - a.n)[0], { ahead: !0 });
  return Object.assign(l.sort((a, b) => b.diff - a.diff || b.n - a.n)[0], { ahead: !1 });
}
// The card. Everything below is already on the device -- it just lives on the
// You and Season tabs, which is nowhere near the moment it matters. You set the
// stakes on the game screen with no idea who is hot, who owns you, or how this
// particular course has treated you, so this reads the roster back to you first.
function theCardRows() {
  const me = getPrimaryPlayerName(),
    course = (state.course || "").trim().toLowerCase();
  const fin = getAllRounds()
    .filter((r) => r.finished && r.money && r.players)
    .sort((a, b) => _rTime(a) - _rTime(b));
  return (state.players || []).map((p) => {
    const name = p.name,
      played = fin.filter((r) => null != _myNet(r, name));
    const net = played.reduce((a, r) => a + _myNet(r, name), 0);
    // Streak runs back from the most recent round and stops at the first result
    // that breaks it; a pushed round ends it rather than extending it.
    let streak = 0,
      dir = 0;
    for (let i = played.length - 1; i >= 0; i--) {
      const v = _myNet(played[i], name),
        sgn = v > 0.005 ? 1 : v < -0.005 ? -1 : 0;
      if (!sgn) break;
      if (!dir) dir = sgn;
      if (sgn !== dir) break;
      streak++;
    }
    let w = 0,
      l = 0,
      diff = 0,
      h2h = 0;
    if (name !== me)
      fin.forEach((r) => {
        const a = _myNet(r, me),
          b = _myNet(r, name);
        if (null == a || null == b) return;
        (h2h++, (diff += b - a), b > a ? w++ : b < a && l++);
      });
    let cN = 0,
      cMoney = 0;
    if (course)
      played.forEach((r) => {
        if ((r.course || "").trim().toLowerCase() === course) (cN++, (cMoney += _myNet(r, name)));
      });
    return {
      name: name,
      color: p.color,
      isMe: name === me,
      rounds: played.length,
      net: net,
      form: played.slice(-5).map((r) => _myNet(r, name)),
      streak: streak,
      dir: dir,
      h2h: h2h,
      w: w,
      l: l,
      diff: diff,
      cN: cN,
      cMoney: cMoney,
    };
  });
}
function renderTheCard() {
  const el = document.getElementById("the-card");
  if (!el) return;
  const rows = theCardRows();
  // Before the group's first finished round there is nothing to say, and an
  // empty shell is worse than no card at all.
  if (!rows.length || !rows.some((r) => r.rounds > 0)) return void (el.innerHTML = "");
  const course = (state.course || "").trim(),
    anyHere = rows.some((r) => r.cN > 0);
  // One scale across every player so the form bars compare like for like.
  const mx = Math.max(1, ...rows.reduce((a, r) => a.concat(r.form.map(Math.abs)), []));
  let h =
    '<div class="tc-wrap"><div class="tc-head"><span class="tc-k">The card</span>' +
    (course && anyHere ? '<span class="tc-where">' + esc(course) + "</span>" : "") +
    '</div><div class="tc-card">';
  rows.forEach((r) => {
    const tags = [];
    if (!r.rounds) tags.push('<span class="tc-new">first round with the group</span>');
    else {
      if (!r.isMe && r.h2h) {
        const amt = fmtMoney(Math.abs(r.diff)).replace("+", "");
        tags.push(
          '<span class="tc-tag">' +
            r.w +
            "–" +
            r.l +
            ' vs you · <b class="' +
            (r.diff > 0.005 ? "match-dn" : r.diff < -0.005 ? "match-up" : "") +
            '">' +
            (Math.abs(r.diff) < 0.005
              ? "all square"
              : amt + (r.diff > 0 ? " up on you" : " down to you")) +
            "</b></span>",
        );
      }
      if (r.streak >= 3)
        tags.push(
          '<span class="' +
            (r.dir > 0 ? "tc-hot" : "tc-cold") +
            '">' +
            (r.dir > 0
              ? ico("flame") + " " + r.streak + " up"
              : ico("down") + " " + r.streak + " down") +
            "</span>",
        );
      if (r.cN)
        tags.push(
          '<span class="tc-tag">' +
            r.cN +
            'R here · <b class="' +
            (r.cMoney > 0.005 ? "match-up" : r.cMoney < -0.005 ? "match-dn" : "") +
            '">' +
            fmtMoney(r.cMoney) +
            "</b></span>",
        );
    }
    // Square-root scale: a single big round would otherwise flatten every other
    // bar onto the floor, which reads as "no form" rather than "a quiet week".
    const bars = r.form
      .map(
        (v) =>
          '<span class="tc-bar ' +
          (v > 0.005 ? "up" : v < -0.005 ? "dn" : "") +
          '" style="height:' +
          Math.max(3, Math.round(16 * Math.sqrt(Math.abs(v) / mx))) +
          'px"></span>',
      )
      .join("");
    h +=
      '<div class="tc-row' +
      (r.isMe ? " tc-me" : "") +
      '">' +
      avatarHTML(r, 26) +
      '<div class="tc-body"><div class="tc-top"><span class="tc-name">' +
      esc(r.name) +
      "</span>" +
      (bars ? '<span class="tc-form" aria-hidden="true">' + bars + "</span>" : "") +
      '<span class="tc-net ' +
      (r.net > 0.005 ? "match-up" : r.net < -0.005 ? "match-dn" : "") +
      '">' +
      (r.rounds ? fmtMoney(r.net) : "—") +
      "</span></div>" +
      (tags.length ? '<div class="tc-tags">' + tags.join("") + "</div>" : "") +
      "</div></div>";
  });
  el.innerHTML = h + "</div></div>";
}
function renderHome() {
  const el = document.getElementById("home-content");
  if (!el) return;
  const { rounds, list, hiddenCount } = seasonAgg(),
    me = getPrimaryPlayerName(),
    mine = list.find((p) => p.name === me);
  if (!rounds.length)
    return void (el.innerHTML = emptyStateHTML(
      ico("flag"),
      "No season yet",
      "Finish and settle a round and your season table starts building here.",
      ["Start a round", "showScreen('games')"],
    ));
  const chrono = rounds.slice().sort((a, b) => _rTime(a) - _rTime(b)),
    lastR = chrono[chrono.length - 1];
  let h = "",
    series = null;
  if (mine) {
    const winPct = mine.rounds ? Math.round((100 * mine.wins) / mine.rounds) : 0;
    let run = 0;
    series = chrono.map((r) => {
      const v = _myNet(r, me);
      return (run += null == v ? 0 : v);
    });
    const lastNet = _myNet(lastR, me);
    let streak = 0;
    for (let i = chrono.length - 1; i >= 0; i--) {
      const v = _myNet(chrono[i], me);
      if (null != v && v > 0.005) streak++;
      else break;
    }
    h +=
      '<div class="season-summary" data-act="showScreen(\'season\')" role="button" tabindex="0" aria-label="Your season details">' +
      '<div><div class="ss-k">Your season</div>' +
      '<div class="ss-v ' +
      (mine.money > 0.005 ? "match-up" : mine.money < -0.005 ? "match-dn" : "") +
      '">' +
      fmtMoney(mine.money) +
      "</div></div>" +
      '<span class="ss-go" aria-hidden="true"><i data-ico="right"></i></span>' +
      (series.length > 1
        ? '<div class="ss-spark"><canvas id="ss-spark" height="40" aria-label="Season money by round"></canvas></div>'
        : "") +
      '<div class="ss-meta">' +
      (null != lastNet
        ? '<b class="' +
          (lastNet > 0.005 ? "match-up" : lastNet < -0.005 ? "match-dn" : "") +
          '">' +
          (lastNet > 0.005 ? ico("up") : lastNet < -0.005 ? ico("down") : "–") +
          " " +
          fmtMoney(lastNet) +
          " last round</b> · "
        : "") +
      mine.rounds +
      " rounds · " +
      winPct +
      "% won" +
      (streak >= 2
        ? ' <span class="streak-chip">' + ico("flame") + " " + streak + "-round heater</span>"
        : "") +
      "</div></div>";
  }
  if (lastR) {
    let bi = 0;
    (lastR.players || []).forEach((p, i) => {
      if ((lastR.money[i] || 0) > (lastR.money[bi] || 0)) bi = i;
    });
    const champ = (lastR.players || [])[bi],
      cv = lastR.money[bi] || 0,
      my = _myNet(lastR, me);
    if (champ) {
      h +=
        '<div class="section-head"><h2>Last time out</h2></div>' +
        '<button class="lr-card" data-act="viewFinishedRound(\'' +
        esc(lastR.id) +
        "')\">" +
        '<div class="lr-top"><span class="lr-course">' +
        esc(lastR.course || "Round") +
        "</span>" +
        '<span class="lr-when">' +
        dLbl(lastR.finishedDate || lastR.date, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }) +
        "</span></div>" +
        '<div class="lr-game">' +
        esc(GAME_NAMES[lastR.gameType] || lastR.gameType || "") +
        "</div>" +
        '<div class="lr-row">' +
        rankChip(1) +
        avatarHTML(champ, 20) +
        '<span class="lr-name">' +
        esc(champ.name) +
        (champ.name === me ? " took it" : " took it") +
        "</span>" +
        '<span class="lr-amt ' +
        (cv > 0.005 ? "match-up" : cv < -0.005 ? "match-dn" : "") +
        '">' +
        fmtMoney(cv) +
        "</span></div>" +
        (null != my && champ.name !== me
          ? '<div class="lr-you">You<b class="' +
            (my > 0.005 ? "match-up" : my < -0.005 ? "match-dn" : "") +
            '">' +
            fmtMoney(my) +
            "</b></div>"
          : "") +
        "</button>";
    }
  }
  const collapsed = groupTableCollapsed(),
    now = _orderOf(chrono),
    prev = _orderOf(chrono.slice(0, -1));
  h +=
    '<div class="section-head lb-head">' +
    '<h2 class="lb-toggle" data-act="toggleGroupTable()" role="button" tabindex="0" aria-expanded="' +
    !collapsed +
    '" aria-controls="lb-body">' +
    '<span class="lb-chevron' +
    (collapsed ? " is-collapsed" : "") +
    '" aria-hidden="true"><i data-ico="down"></i></span>The Group · money table</h2>' +
    (collapsed
      ? ""
      : '<a class="link-btn" data-act="event.stopPropagation();toggleGroupEdit()" role="button" tabindex="0">' +
        (_groupEditMode ? "Done" : "Edit") +
        "</a>") +
    "</div>";
  if (!collapsed) {
    h += '<div id="lb-body" class="lb-card' + (_groupEditMode ? " is-editing" : "") + '">';
    list.forEach((p, i) => {
      const canRemove = _groupEditMode && p.name !== me,
        pi = prev.indexOf(p.name),
        ni = now.indexOf(p.name);
      const moved = pi >= 0 && ni >= 0 && pi !== ni;
      const mv = _groupEditMode
        ? ""
        : '<span class="lb-move ' +
          (moved ? (ni < pi ? "up" : "dn") : "flat") +
          '"' +
          (moved
            ? ' aria-label="' +
              (ni < pi ? "up " : "down ") +
              Math.abs(pi - ni) +
              ' since last round"'
            : ' aria-hidden="true"') +
          ">" +
          (moved ? (ni < pi ? ico("up") : ico("down")) + Math.abs(pi - ni) : "–") +
          "</span>";
      h +=
        '<div class="lb-row' +
        (p.name === me ? " lb-me" : "") +
        '">' +
        rankChip(i + 1) +
        avatarHTML(p, 22) +
        '<span class="lb-name">' +
        esc(p.name) +
        "<small>" +
        p.rounds +
        " rounds</small></span>" +
        mv +
        '<span class="lb-amt ' +
        (p.money > 0.005 ? "match-up" : p.money < -0.005 ? "match-dn" : "") +
        '">' +
        fmtMoney(p.money) +
        "</span>" +
        (canRemove
          ? '<button class="lb-del" data-name="' +
            esc(p.name) +
            '" data-act="removeSeasonPlayer(this.dataset.name)" aria-label="Remove ' +
            esc(p.name) +
            ' from season"><i data-ico="close"></i></button>'
          : _groupEditMode
            ? '<span class="lb-del lb-del-lock" aria-hidden="true"></span>'
            : "") +
        "</div>";
    });
    h += "</div>";
    if (hiddenCount > 0)
      h +=
        '<div class="lb-hidden-note"><span>' +
        hiddenCount +
        ' hidden</span><a class="link-btn" data-act="showAllSeasonPlayers()" role="button" tabindex="0">Show all</a></div>';
  }
  const rv = _rivalOf(chrono, me);
  if (rv && rv.n >= 2) {
    const amt = fmtMoney(Math.abs(rv.diff)).replace("+", "");
    h +=
      '<div class="section-head"><h2>' +
      (rv.ahead ? "Your nemesis" : "You own") +
      "</h2></div>" +
      '<div class="rv-card">' +
      avatarHTML(rv, 34) +
      '<div class="rv-txt"><div class="rv-who">' +
      esc(rv.name) +
      "</div>" +
      '<div class="rv-sub">' +
      rv.n +
      " round" +
      (1 === rv.n ? "" : "s") +
      " together</div></div>" +
      '<div class="rv-rec"><div class="rv-num">' +
      rv.w +
      "–" +
      rv.l +
      "</div>" +
      '<div class="rv-amt ' +
      (rv.ahead ? "match-dn" : "match-up") +
      '">' +
      amt +
      (rv.ahead ? " up on you" : " up on them") +
      "</div></div></div>";
  }
  el.innerHTML = h;
  if (series && series.length > 1) {
    const cv = document.getElementById("ss-spark");
    cv && requestAnimationFrame(() => drawSparkline(cv, series));
  }
}
function watchLinkURL() {
  const c = state.liveCode || "";
  return c ? location.origin + location.pathname + "?watch=" + encodeURIComponent(c) : null;
}
function emptyStateHTML(icon, title, body, cta) {
  return (
    '<div class="empty-state"><div class="es-icon" aria-hidden="true">' +
    icon +
    "</div>" +
    '<div class="es-title">' +
    esc(title) +
    "</div>" +
    '<div class="es-body">' +
    esc(body) +
    "</div>" +
    (cta
      ? '<button class="btn primary" data-act="' + cta[1] + '">' + esc(cta[0]) + "</button>"
      : "") +
    "</div>"
  );
}
function mostRecentRound(finished) {
  const r = getAllRounds()
    .filter((r) => (finished ? r.finished : !r.finished && r.started))
    .sort((a, b) => new Date(b.finishedDate || b.date) - new Date(a.finishedDate || a.date));
  return r[0] || null;
}
function renderWatch() {
  const el = document.getElementById("watch-content");
  if (!el) return;
  if (!roundHasScores()) {
    const lr = mostRecentRound(!1);
    return void (el.innerHTML = lr
      ? emptyStateHTML(
          ico("signal"),
          "Nothing on the wire",
          "A round is in progress at " +
            (lr.course || "your course") +
            ". Open it to follow the money live.",
          ["Open that round", "loadRound(\'" + lr.id + "\')"],
        )
      : emptyStateHTML(
          ico("signal"),
          "Nothing to watch yet",
          "Start a round, or join someone else\u2019s with a watch code from Home.",
          ["Go to Home", "showScreen(\'home\')"],
        ));
  }
  const money = calcMoney(),
    idx = state.players.map((p, i) => i).sort((a, b) => money[b] - money[a]);
  const played = (() => {
    let n = 0;
    for (let hI = 0; hI < maxHole(); hI++)
      state.players.some((p, i) => null == state.scores[i]?.[hI]) || n++;
    return n;
  })();
  let h =
    '<div class="watch-top"><button class="btn ghost watch-exit" data-act="showScreen(\'home\')"><i data-ico="arrowLeft"></i> Home</button><span class="pill-live"><span class="blink"></span>LIVE</span></div>';
  h +=
    '<div class="card watch-head"><div><div class="watch-course">' +
    esc(state.course || "Round") +
    '</div><div class="hint">' +
    esc(GAME_NAMES[state.gameType] || state.gameType || "") +
    '</div></div><div class="watch-thru"><div class="stat-k">Thru</div><div class="watch-thru-n">' +
    played +
    "<span>/" +
    maxHole() +
    "</span></div></div></div>";
  h += '<div class="section-head"><h2>Money board</h2></div><div class="lb-card">';
  idx.forEach((i, pos) => {
    const v = money[i];
    h +=
      '<div class="lb-row">' +
      rankChip(pos + 1) +
      avatarHTML(state.players[i], 22) +
      '<span class="lb-name">' +
      esc(state.players[i].name) +
      "</span>" +
      '<span class="lb-amt ' +
      (v > 0.005 ? "match-up" : v < -0.005 ? "match-dn" : "") +
      '">' +
      fmtMoney(v) +
      "</span></div>";
  });
  h += "</div>";
  h += moneyFlowHTML("watch-flow-chart");
  h += '<div id="watch-feed"></div>';
  const link = watchLinkURL();
  link &&
    (h +=
      '<div class="watch-link"><span class="hint">' +
      ico("link") +
      '</span><span class="watch-link-url">' +
      esc(link) +
      '</span><button class="btn ghost" data-act="copyWatchLink()">Copy</button></div>');
  el.innerHTML = h;
  const feed = document.getElementById("watch-feed"),
    src = document.getElementById("play-feed");
  if (feed && src) {
    renderPlayFeed();
    feed.innerHTML = src.innerHTML;
    feed.className = src.innerHTML ? "card watch-feed-card sc-collapsible" : "";
  }
  requestAnimationFrame(() => drawMoneyFlow(document.getElementById("watch-flow-chart")));
}
function copyWatchLink() {
  const l = watchLinkURL();
  l && copyText(l, "Watch link copied");
}
function roundHasScores() {
  if (!state.players || !state.players.length) return !1;
  for (let i = 0; i < state.players.length; i++) {
    const r = state.scores && state.scores[i];
    if (r) for (const k in r) if (null != r[k]) return !0;
  }
  return !1;
}
function renderSettle() {
  const el = document.getElementById("settle-content");
  if (!el) return;
  if (!roundHasScores() || "none" === state.gameType) {
    const live = mostRecentRound(!1),
      done = live ? null : mostRecentRound(!0);
    return void (el.innerHTML = live
      ? emptyStateHTML(
          ico("dollar"),
          "Round still in play",
          (live.course || "Your round") +
            " hasn\u2019t been settled yet. Open it to see who owes what.",
          ["Open that round", "loadRound(\'" + live.id + "\')"],
        )
      : done
        ? emptyStateHTML(
            ico("dollar"),
            "Nothing outstanding",
            "Every round is settled. Your last one was at " + (done.course || "your course") + ".",
            ["View that round", "viewFinishedRound(\'" + done.id + "\')"],
          )
        : emptyStateHTML(
            ico("dollar"),
            "No money on the line",
            "Start a round with a bet and the settlement shows up here.",
            ["Start a round", "showScreen(\'games\')"],
          ));
  }
  const nets = roundNetsToCents(calcMoney()),
    me = getPrimaryPlayerName(),
    myIdx = state.players.findIndex((p) => p.name === me);
  let h = "";
  if (myIdx >= 0) {
    const v = nets[myIdx];
    h +=
      '<div class="card take-card"><div class="stat-k">Your take · ' +
      esc(state.course || "Round") +
      '</div><div class="take-amt ' +
      (v > 0.005 ? "match-up" : v < -0.005 ? "match-dn" : "") +
      '">' +
      fmtMoney(v) +
      "</div></div>";
  }
  h += moneyFlowHTML("settle-flow-chart");
  h += '<div class="section-head"><h2>Table</h2></div>' + payoutTable(nets);
  const pays = computeSettlement(nets);
  h +=
    '<div class="section-head"><h2>Who pays who</h2><span class="pill-soft">' +
    pays.length +
    " payment" +
    (1 === pays.length ? "" : "s") +
    "</span></div>";
  h += pays.length
    ? '<div class="settlement-list">' +
      pays
        .map(
          (p) =>
            '<div class="settlement-row">' +
            avatarHTML(state.players[p.from], 20) +
            '<span class="settlement-from">' +
            esc(state.players[p.from].name) +
            '</span><span class="settlement-arrow"><i data-ico="arrowRight"></i></span>' +
            '<span class="settlement-to">' +
            esc(state.players[p.to].name) +
            '</span><span class="settlement-amt">' +
            fmtMoney(p.amt).replace("+", "") +
            "</span>" +
            venmoBtn(p.to, p.amt) +
            "</div>",
        )
        .join("") +
      "</div>"
    : '<div class="hint">All square — no payments needed!</div>';
  h +=
    '<button class="btn primary" style="width:100%;margin-top:16px" data-act="shareRoundRecap()">Share round recap</button>';
  el.innerHTML = h;
  requestAnimationFrame(() => drawMoneyFlow(document.getElementById("settle-flow-chart")));
}
function drawSparkline(cv, series) {
  if (!cv || !series || series.length < 2) return;
  const dpr = window.devicePixelRatio || 1,
    w = cv.clientWidth || 88,
    h = cv.height || 42;
  ((cv.width = w * dpr), (cv.height = h * dpr), (cv.style.height = h + "px"));
  const ctx = cv.getContext("2d");
  (ctx.setTransform(dpr, 0, 0, dpr, 0, 0), ctx.clearRect(0, 0, w, h));
  const mx = Math.max(...series),
    mn = Math.min(...series),
    n = series.length,
    X = (i) => 3 + (w - 6) * (i / (n - 1)),
    Y = (v) => (mx === mn ? h / 2 : 5 + (h - 10) * (1 - (v - mn) / (mx - mn))),
    acc =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#96690c";
  (ctx.beginPath(), ctx.moveTo(X(0), h));
  series.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
  (ctx.lineTo(X(n - 1), h),
    ctx.closePath(),
    (ctx.fillStyle = acc),
    (ctx.globalAlpha = 0.14),
    ctx.fill(),
    (ctx.globalAlpha = 1));
  (ctx.beginPath(),
    series.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))),
    (ctx.strokeStyle = acc),
    (ctx.lineWidth = 2),
    (ctx.lineJoin = "round"),
    ctx.stroke());
  (ctx.beginPath(),
    ctx.arc(X(n - 1), Y(series[n - 1]), 3, 0, 7),
    (ctx.fillStyle = acc),
    ctx.fill());
}
/* One stepper, rendered on the You screen and again in Settings, so both are
   the same edit. The steppers get tapped in bursts, so they patch the fields
   they can see instead of rebuilding the screen under the thumb. */
function myHdcpFieldHTML(id) {
  const set = myHandicap();
  return (
    '<div class="hdcp-input-wrap"><button type="button" data-act="stepMyHandicap(-1)" aria-label="Lower your handicap">\u2212</button>' +
    '<input type="text" inputmode="decimal" class="my-hdcp"' +
    (id ? ' id="' + id + '"' : "") +
    ' maxlength="5" value="' +
    (null == set ? "" : fmtHdcp(set)) +
    '"' +
    ' placeholder="\u2014" aria-label="Your handicap index \u2014 type + for a plus handicap" data-change="setMyHandicapFromField(this)">' +
    '<button type="button" data-act="stepMyHandicap(1)" aria-label="Raise your handicap">+</button></div>'
  );
}
const MY_HDCP_UNSET = "Not set yet \u2014 every new round starts you at 0.",
  MY_HDCP_SET = "Remembered \u2014 every new round starts you here.";
/* The state line has to move with the number. A figure that changes while the
   line under it still says "not set" is the same stale-chip failure the roster
   handicap had: indistinguishable from the app ignoring what was typed. */
function refreshMyHdcpFields(h) {
  document.querySelectorAll(".my-hdcp").forEach((el) => {
    el.value = fmtHdcp(h);
  });
  document.querySelectorAll(".my-hdcp-state").forEach((el) => {
    el.textContent = MY_HDCP_SET;
  });
}
function setMyHandicapFromField(el) {
  const raw = String((el && el.value) || "").trim();
  /* Emptying the field is not a claim to play off scratch, so it is left
     alone rather than filed as a 0 that then strokes the whole group. */
  if (!raw) return void (el.value = null == myHandicap() ? "" : fmtHdcp(myHandicap()));
  const claimed = primaryPlayerIsGuess() && myProfileName(),
    h = setMyHandicap(raw);
  if (null == h)
    return void showToast(
      myProfileName()
        ? "Couldn't save your handicap \u2014 your device storage may be full."
        : "Say which player is you first, then set your handicap.",
      { type: "error" },
    );
  (haptic(), refreshMyHdcpFields(h));
  showToast(
    claimed
      ? "You\u2019re playing as " + claimed + " off " + fmtHdcp(h) + ". Change it in Settings."
      : "Handicap saved \u2014 every new round starts you at " + fmtHdcp(h) + ".",
    { type: "success" },
  );
}
function stepMyHandicap(d) {
  const cur = myHandicap(),
    claimed = primaryPlayerIsGuess() && myProfileName(),
    h = setMyHandicap((null == cur ? 0 : cur) + d);
  if (null == h)
    return void showToast(
      myProfileName()
        ? "Couldn't save your handicap \u2014 your device storage may be full."
        : "Say which player is you first, then set your handicap.",
      { type: "error" },
    );
  (haptic(), refreshMyHdcpFields(h));
  /* Only on the tap that actually wrote the name down -- a burst of steps must
     not be a burst of toasts. */
  claimed &&
    showToast("You\u2019re playing as " + claimed + ". Change it in Settings.", { type: "info" });
}
/* The handicap on this screen is the profile field and nothing else: what you
   say you play off. The computed index used to sit beside it as a second
   opinion -- "your rounds work out to 12.3", with one tap to take it -- and a
   screen that answers the question twice leaves you working out which number
   the round will actually stroke off. It is the typed one, so that is the only
   one shown. The index is still computed for the roster suggestion. */
function myHandicapCardHTML() {
  if (!myProfileName()) return "";
  const set = myHandicap();
  return (
    '<div class="card you-hcp"><div class="row-between">' +
    '<div><div class="stat-k">Your handicap</div><div class="hint my-hdcp-state">' +
    (null == set ? MY_HDCP_UNSET : MY_HDCP_SET) +
    "</div></div>" +
    myHdcpFieldHTML("my-hdcp") +
    "</div>" +
    "</div>"
  );
}
function renderYou() {
  const el = document.getElementById("you-content");
  if (!el) return;
  const me = getPrimaryPlayerName(),
    { rounds, list } = seasonAgg(),
    mine = list.find((p) => p.name === me),
    /* The handicap you typed is the only one this screen shows. */
    mySet = myHandicap();
  let h =
    '<div class="card you-card">' +
    avatarHTML({ name: me || "?", color: playerColor(mine || {}) }, 52) +
    '<div class="you-id"><div class="you-name">' +
    esc(me || "No player set") +
    '</div><div class="hint">' +
    (null != mySet
      ? 'Plays off <b class="num">' + fmtHdcp(mySet) + "</b>"
      : mine
        ? mine.rounds + " round" + (1 === mine.rounds ? "" : "s") + " this season"
        : "No rounds yet") +
    '</div><button type="button" class="you-whoami" data-act="showSettings()">' +
    (primaryPlayerIsGuess()
      ? "Not you? Set who you are"
      : "Playing as " + esc(me || "\u2014") + " \u00b7 change") +
    "</button></div></div>";
  h += myHandicapCardHTML();
  if (mine) {
    const winPct = mine.rounds ? Math.round((100 * mine.wins) / mine.rounds) : 0;
    h +=
      '<div class="stat-grid">' +
      '<div class="stat-tile"><div class="stat-k">Season net</div><div class="stat-v ' +
      (mine.money > 0.005 ? "match-up" : mine.money < -0.005 ? "match-dn" : "") +
      '">' +
      fmtMoney(mine.money) +
      "</div></div>" +
      '<div class="stat-tile"><div class="stat-k">Rounds</div><div class="stat-v">' +
      mine.rounds +
      "</div></div>" +
      '<div class="stat-tile"><div class="stat-k">Win rate</div><div class="stat-v">' +
      winPct +
      "<small>%</small></div></div>" +
      '<div class="stat-tile"><div class="stat-k">Players</div><div class="stat-v">' +
      list.length +
      "</div></div>" +
      "</div>";
    const others = list.filter((p) => p.name !== me);
    if (others.length) {
      h += '<div class="section-head"><h2>Head to head</h2></div><div class="card">';
      others.forEach((o) => {
        let w = 0,
          l = 0,
          diff = 0;
        rounds.forEach((r) => {
          const mi = (r.players || []).findIndex((p) => p.name === me),
            oi = (r.players || []).findIndex((p) => p.name === o.name);
          if (mi < 0 || oi < 0) return;
          const d = (r.money[mi] || 0) - (r.money[oi] || 0);
          ((diff += d), d > 0.005 ? w++ : d < -0.005 && l++);
        });
        const tot = w + l;
        if (!tot) {
          h +=
            '<div class="h2h">' +
            avatarHTML(o, 22) +
            '<span class="nm">' +
            esc(o.name) +
            '</span><span class="rec hint">no head-to-head yet</span></div>';
        } else {
          const pct = Math.round((100 * w) / tot);
          h +=
            '<div class="h2h">' +
            avatarHTML(o, 22) +
            '<span class="nm">' +
            esc(o.name) +
            "</span>" +
            '<span class="bar"><i style="width:' +
            pct +
            '%"></i></span>' +
            '<span class="rec">' +
            w +
            "–" +
            l +
            ' · <b class="' +
            (diff > 0.005 ? "match-up" : diff < -0.005 ? "match-dn" : "") +
            '">' +
            fmtMoney(diff) +
            "</b></span></div>";
        }
      });
      h += "</div>";
    }
  }
  if (me) {
    const tr = trophiesFor(me);
    if (mine) {
      h += '<div class="section-head"><h2>Trophy case</h2></div>';
      h += tr.length
        ? '<div class="badges">' +
          tr
            .map(
              (t) =>
                '<span class="badge"><span class="badge-ico">' +
                t.ico +
                "</span>" +
                esc(t.label) +
                "</span>",
            )
            .join("") +
          "</div>"
        : '<div class="hint">Win a round to earn your first trophy.</div>';
    }
    const bg = bestGameFor(me);
    bg &&
      "none" !== bg.game &&
      (h +=
        '<div class="section-head"><h2>Best game</h2></div>' +
        '<div class="card row-between"><div><div class="bg-name">' +
        esc(GAME_NAMES[bg.game] || bg.game) +
        '</div><div class="hint">' +
        bg.rounds +
        " round" +
        (1 === bg.rounds ? "" : "s") +
        "</div></div>" +
        '<div class="bg-amt ' +
        (bg.money > 0.005 ? "match-up" : bg.money < -0.005 ? "match-dn" : "") +
        '">' +
        fmtMoney(bg.money) +
        "</div></div>");
  }
  h +=
    '<button class="btn secondary" style="width:100%;margin-top:16px" data-act="showSettings()">Settings</button>';
  h +=
    '<button class="btn ghost" style="width:100%;margin-top:10px" data-act="showScreen(\'season\')">Season history <i data-ico="right"></i></button>';
  el.innerHTML = h;
} // A round that arrived without a usable date (a hand-edited backup, a partial
// sync) must not render the literal string "Invalid Date" at people.
function dLbl(v, o) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "\u2014" : d.toLocaleDateString("en-US", o);
}
function renderResumeCard() {
  const e = document.getElementById("resume-card"),
    t = getAllRounds()
      .filter((e) => !e.finished && e.started)
      .sort((e, t) => new Date(t.date) - new Date(e.date));
  if (!t.length) return void e.classList.add("hidden");
  const a = t[0],
    s = dLbl(a.date, { month: "short", day: "numeric" }),
    n = Object.keys(a.scores?.[0] || {}).length,
    o = (a.players || []).map((e) => esc(e.name)).join(", ");
  (e.classList.remove("hidden"),
    (e.innerHTML = `<div class="resume-card-inner" data-act="loadRound('${a.id}')" role="button" tabindex="0">\n    <div class="resume-label">Resume Live Round</div>\n    <div class="resume-course">${esc(a.course || "Round")}</div>\n    <div class="resume-meta">${s} · ${GAME_NAMES[a.gameType] || a.gameType} · ${n}/${a.holeCount || 18} holes · ${o}</div>\n  </div>`));
}
function renderLiveGames() {
  const _all = getAllRounds()
      .filter((e) => !e.finished && e.started)
      .sort((e, t) => new Date(t.date) - new Date(e.date)),
    e = _all.slice(1),
    t = document.getElementById("live-list"),
    a = document.getElementById("live-empty"),
    lc = document.getElementById("live-count");
  if ((lc && (lc.textContent = _all.length || ""), !t)) return;
  if (!e.length) return ((t.innerHTML = ""), void (a && a.classList.remove("hidden")));
  (a && a.classList.add("hidden"),
    (t.innerHTML = e
      .map((e) => {
        const t = dLbl(e.date, { month: "short", day: "numeric" }),
          a = Object.keys(e.scores?.[0] || {}).length,
          s = (e.players || []).map((e) => esc(e.name)).join(", ");
        return `<div class="round-card" data-act="loadRound('${e.id}')" role="button" tabindex="0">\n      <div class="round-card-top">\n        <span class="round-card-course">${esc(e.course || "Round")}</span>\n        <span class="round-card-date">${t}</span>\n      </div>\n      <div class="round-card-meta">${esc(e.gameType)} · ${a}/18 holes · ${s}</div>\n      <div class="round-card-actions">\n        <span class="round-card-live">Live</span>\n        <button class="round-card-del" data-act="event.stopPropagation();deleteRound('${e.id}')" aria-label="Delete round"><i data-ico="close"></i></button>\n      </div>\n    </div>`;
      })
      .join("")));
}
function renderHistory() {
  const r = getAllRounds()
      .filter((e) => e.finished)
      .sort((e, t) => new Date(t.finishedDate || t.date) - new Date(e.finishedDate || e.date)),
    t = document.getElementById("history-list"),
    a = document.getElementById("history-empty");
  if (
    ((() => {
      const _hc = document.getElementById("history-count");
      _hc && (_hc.textContent = r.length || "");
    })(),
    !r.length)
  )
    return ((t.innerHTML = ""), void a.classList.remove("hidden"));
  a.classList.add("hidden");
  const q = (document.getElementById("history-search")?.value || "").trim().toLowerCase(),
    e = q
      ? r.filter(
          (e) =>
            (e.course || "").toLowerCase().includes(q) ||
            (e.gameType || "").toLowerCase().includes(q),
        )
      : r;
  if (q && !e.length)
    return void (t.innerHTML = emptyStateHTML(
      ico("search"),
      "No matches",
      "No rounds match that course or game type.",
      ["Clear search", "clearHistorySearch()"],
    ));
  ((t.innerHTML = e
    .map((e) => {
      const t = dLbl(e.finishedDate || e.date, { month: "short", day: "numeric" }),
        a = (e.players || []).map((e) => esc(e.name)).join(", "),
        s = e.money || [],
        n = e.players && s.length ? e.players[s.indexOf(Math.max(...s))]?.name : "",
        o = s.length ? Math.max(...s) : 0,
        g = e.gameType ? e.gameType.charAt(0).toUpperCase() + e.gameType.slice(1) : "Round";
      return `<div class="round-card history" data-act="viewFinishedRound('${e.id}')" role="button" tabindex="0">\n      <div class="round-card-top">\n        <span class="round-card-course">${esc(e.course || "Round")}</span>\n        <span class="round-card-date">${t}</span>\n      </div>\n      <div class="round-card-meta">${g} · ${a}</div>\n      <div class="round-card-winner">${o > 0 ? esc(n) + (n === "You" ? " take" : " takes") + " it · <span class='rc-amt'>" + fmtMoney(o) + "</span>" : "All square"}</div>\n      <div class="round-card-actions">\n        <span class="round-card-finished">Recorded</span>\n        <button class="round-card-del" data-act="event.stopPropagation();deleteRound('${e.id}')" aria-label="Delete round"><i data-ico="close"></i></button>\n      </div>\n    </div>`;
    })
    .join("")),
    renderSeasonStats(),
    renderSeasonExtras(),
    renderScoringStats());
}
function updateNavCounts() {
  const e = getAllRounds(),
    t = e.filter((e) => !e.finished && e.started).length,
    a = e.filter((e) => e.finished).length,
    lc = document.getElementById("live-count"),
    hc = document.getElementById("history-count");
  (lc && (lc.textContent = t || ""), hc && (hc.textContent = a || ""));
}
function quickStart() {
  const e = getAllRounds()
    .filter((e) => e.finished)
    .sort((e, t) => new Date(t.finishedDate || t.date) - new Date(e.finishedDate || e.date));
  if (!e.length) return void enterScreen("setup");
  const t = e[0];
  ((state.players = t.players || []),
    (state.gameType = t.gameType || "wolf"),
    (state.gameOpts = t.gameOpts || {}),
    (state.pars = t.pars || [...STANDARD_PARS]),
    (state.hdcps = t.hdcps || [...STANDARD_HDCP]),
    (state.holeCount = t.holeCount || 9),
    (state.holeStart = t.holeStart || 0),
    (state.handicapMode = t.handicapMode || "full"),
    (state.course = t.course || ""),
    (document.getElementById("course-name").value = state.course));
  const a = document.getElementById("handicap-mode");
  (a && (a.value = state.handicapMode),
    invalidateHdcpCache(),
    buildParGrid(),
    renderPlayers(),
    updateGameOptions(),
    startRound());
} /* Repaint whatever is on screen: player colours re-step per skin, so a live
   scoring screen is wrong until it is rebuilt. */
function setSkin(e) {
  if (!SKINS.includes(e)) return;
  ((document.documentElement.dataset.theme = e), safeSetItem("skin", e), applyThemeColorMeta());
  try {
    state.started && !document.getElementById("scoring-screen").classList.contains("hidden")
      ? renderHole()
      : SCREENS[_currentScreen] && SCREENS[_currentScreen].enter && SCREENS[_currentScreen].enter();
  } catch (t) {}
}
function pickSkin(e, el) {
  setSkin(e);
  if (el && el.parentElement)
    [...el.parentElement.children].forEach((c) => {
      const on = c === el;
      (c.classList.toggle("active", on), c.setAttribute("aria-checked", on ? "true" : "false"));
    });
  haptic();
}
function dismissAuthBanner() {
  try {
    localStorage.setItem("authBannerDismissed", "1");
  } catch (e) {}
  (applyAuthBannerPref(), haptic());
}
function applyAuthBannerPref() {
  const d = "1" === localStorage.getItem("authBannerDismissed"),
    f = document.getElementById("auth-banner-full"),
    m = document.getElementById("auth-banner-mini");
  (f && f.classList.toggle("hidden", d), m && m.classList.toggle("hidden", !d));
} // Rounds are scored on courses with patchy signal, so say plainly that being
// offline is fine rather than leaving people guessing why sync went quiet.
function applyOfflineChip() {
  const c = document.getElementById("offline-chip");
  c && c.classList.toggle("hidden", !1 !== navigator.onLine);
}
