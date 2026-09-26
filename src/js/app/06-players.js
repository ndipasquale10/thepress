function getSavedProfiles() {
  return safeParseJSON(localStorage.getItem("golfProfiles"), []);
}
function suggestHandicaps() {
  if (!state.players || !state.players.length) return 0;
  const rounds = getAllRounds();
  let n = 0;
  state.players.forEach((p) => {
    if (!p.name || p._hdcpTouched) return;
    const h = computeHandicapIndex(p.name, rounds);
    null != h.index &&
      h.rounds >= 3 &&
      Math.abs((p.hdcp || 0) - h.index) > 0.05 &&
      ((p.hdcp = Math.round(10 * h.index) / 10), n++);
  });
  return n;
}
/* Merged into the stored row, not written over it. The row can carry fields
   this round never had -- hdcpSet, which says a person typed that handicap --
   and a wholesale overwrite dropped them, so the figure set on the You screen
   was forgotten by the first round that started. */
function saveProfiles() {
  const e = state.players.map((e) => ({
      name: e.name,
      hdcp: e.hdcp,
      color: playerColor(e),
      colorIdx: colorIdxOf(e),
      venmo: e.venmo || "",
      cashapp: e.cashapp || "",
      paypal: e.paypal || "",
      hdcpSet: !!e._hdcpTouched,
    })),
    t = getSavedProfiles();
  (e.forEach((e) => {
    const a = t.findIndex((t) => t.name.toLowerCase() === e.name.toLowerCase());
    a >= 0 ? (t[a] = { ...t[a], ...e, hdcpSet: !!(e.hdcpSet || t[a].hdcpSet) }) : t.push(e);
  }),
    safeSetItem("golfProfiles", JSON.stringify(t)));
}
/* YOUR PROFILE -- the one thing about you that is not a fact about a round.
   A handicap could only ever be typed into a roster row, and the row is thrown
   away with the round: startRound() was the only thing that ever wrote it
   down, so a Saturday that never got past the first tee forgot the number, and
   the You screen showed a computed index that stays null until three rounds
   are finished. People re-typed their own handicap every week.

   The profile that remembers it is the saved-database row carrying your name.
   Deliberately not a new key: editing your handicap here, under Manage, and on
   your roster row are then one edit rather than three numbers that disagree.
   `hdcpSet` is the whole point of the record -- it separates a figure a person
   typed from the 0 every blank slot is born with, which is what stops
   suggestHandicaps() overwriting what you just said you play off. */
function myProfileIndex(list) {
  const me = String(getPrimaryPlayerName() || "")
    .trim()
    .toLowerCase();
  if (!me) return -1;
  return (list || getSavedProfiles()).findIndex(
    (p) =>
      p &&
      String(p.name || "")
        .trim()
        .toLowerCase() === me,
  );
}
function myProfile() {
  const list = getSavedProfiles(),
    i = myProfileIndex(list);
  return i < 0 ? null : list[i];
}
/* null, not 0. "Scratch" and "never said" have to stay tellable apart or the
   You screen invents a handicap for everybody who has not set one yet. */
function myHandicap() {
  const p = myProfile();
  return p && p.hdcpSet ? parseHdcp(p.hdcp) : null;
}
/* Nobody is filed under a blank or a roster placeholder: an unanswered "which
   one is you?" must not create a profile called "Player 1". */
function myProfileName() {
  const n = String(getPrimaryPlayerName() || "").trim();
  return n && !isPlaceholderPlayer({ name: n }) ? n : "";
}
function saveMyProfile(patch) {
  const me = myProfileName();
  if (!me) return !1;
  const list = getSavedProfiles(),
    i = myProfileIndex(list);
  if (i < 0) {
    const ci = list.length % 8;
    list.push({
      name: me,
      hdcp: 0,
      colorIdx: ci,
      color: paletteFor()[ci],
      venmo: "",
      cashapp: "",
      paypal: "",
      ...patch,
    });
  } else list[i] = { ...list[i], ...patch };
  return safeSetItem("golfProfiles", JSON.stringify(list));
}
/* Returns the handicap it stored, or null if it could not store one, so the
   caller can say so instead of echoing a number that never landed. */
function setMyHandicap(v) {
  const me = myProfileName();
  if (!me) return null;
  const h = parseHdcp(v);
  if (!saveMyProfile({ hdcp: h, hdcpSet: !0 })) return null;
  /* The name was a guess off the round history until now. Saying what you play
     off, on a card headed by that name, is the answer to "which one is you?" --
     and writing it down is what stops the app quietly narrating somebody
     else's season as yours. Settings changes it. */
  primaryPlayerIsGuess() && safeSetItem("primaryPlayer", me);
  /* A roster still being set up is the same person, so it follows. Locked once
     the round starts: every stroke already given hangs off the figure the
     round began with. */
  let hit = !1;
  if (!state.started) {
    const k = me.toLowerCase();
    (state.players || []).forEach((p) => {
      p &&
        String(p.name || "")
          .trim()
          .toLowerCase() === k &&
        ((p.hdcp = h), (p._hdcpTouched = !0), (hit = !0));
    });
  }
  if (hit) {
    invalidateHdcpCache();
    const ss = document.getElementById("setup-screen");
    ss && !ss.classList.contains("hidden") && renderPlayers();
  }
  return h;
}
/* The reverse direction: a roster row for you that nobody has touched this
   round starts from the remembered figure rather than from 0. */
function adoptMyHandicap() {
  if (state.started) return !1;
  const h = myHandicap(),
    me = myProfileName().toLowerCase();
  if (null == h || !me) return !1;
  let hit = !1;
  (state.players || []).forEach((p) => {
    p &&
      !p._hdcpTouched &&
      String(p.name || "")
        .trim()
        .toLowerCase() === me &&
      ((p.hdcp = h), (p._hdcpTouched = !0), (hit = !0));
  });
  return hit && (invalidateHdcpCache(), !0);
}
/* A handicap typed on the first tee is the same fact as one typed on the You
   screen, so the phone owner's is filed the moment it is entered instead of
   waiting for a round that may never be started. */
function rememberIfMine(pl) {
  const me = myProfileName().toLowerCase();
  if (
    !pl ||
    !me ||
    String(pl.name || "")
      .trim()
      .toLowerCase() !== me
  )
    return !1;
  return saveMyProfile({ hdcp: parseHdcp(pl.hdcp), hdcpSet: !0 });
}
/* A new round opens as four blank "Player N" slots, and the phone's owner is
   in almost every one of them -- so slot one is filled in from the profile
   that knows your handicap rather than left for you to type again. Only once
   the app has actually been told who you are: seating a guess would put
   somebody else's name and number on your card.

   Called on every entry to the roster screen, not just at startup. Booting
   once was not enough: the roster is replaced wholesale by opening a finished
   round, by Quick Start and by last-group, so the next round you set up was
   whoever those rounds held -- you, if you were lucky. Safe to re-run because
   it only ever fills a blank "Player N" slot or appends; a name somebody typed
   is never touched, and being in the roster already makes it a no-op.

   Taking your own row out is the one thing it does not argue with: scoring for
   a group you are not playing in is a real thing people do on this app, and a
   roster page that puts you back every time you leave it would make that
   impossible. That decision lasts as long as the setup does -- starting a
   round, or saying who you are, asks the question again. */
let _unseatedMe = !1;
function seatMe() {
  if (state.started || primaryPlayerIsGuess() || _unseatedMe) return !1;
  const me = myProfileName();
  if (!me || inRoster(me)) return !1;
  if (!_addToRoster(myProfile() || { name: me, hdcp: 0 })) return !1;
  return (renderPlayers(), !0);
}
/* Adding somebody used to mean: scroll past every saved player ever typed in,
   find them, tap, then delete one of the four "Player N" placeholders the app
   seeded. These three things fix that -- the roster fills its own blank slots,
   nobody arrives wearing a colour somebody else is already using, and the
   database is ordered by who you actually play with. */
function inRoster(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase();
  return (
    !!n &&
    (state.players || []).some(
      (p) =>
        p &&
        String(p.name || "")
          .trim()
          .toLowerCase() === n,
    )
  );
}
/* An untouched "Player 3" is a slot, not a person: filling it is what the user
   meant by tapping a name, and appending instead is what left rosters of eight. */
function isPlaceholderPlayer(p) {
  return (
    !!p && /^player\s*\d+$/i.test(String(p.name || "").trim()) && !p._hdcpTouched && !Number(p.hdcp)
  );
}
/* Avatar colour is the only way players are told apart in the ribbon, the
   scorecard and the settlement rows, so two of them must never match. Keep a
   player's usual colour when it is free and take the next free one when it is
   not. */
function freeColorIdx(pref, skipIdx) {
  const used = new Set();
  (state.players || []).forEach((p, i) => {
    i !== skipIdx && p && used.add(colorIdxOf(p));
  });
  const want = Number.isInteger(pref) ? ((pref % 8) + 8) % 8 : null;
  if (null !== want && !used.has(want)) return want;
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return (state.players || []).length % 8;
}
function _profileToPlayer(src, slot) {
  const pref = Number.isInteger(src.colorIdx)
      ? src.colorIdx
      : src.color
        ? nearestColorIdx(src.color)
        : null,
    ci = freeColorIdx(pref, slot);
  /* A handicap a person set is marked as touched on the way in, so the
     history-derived suggestion cannot overwrite the figure they chose. */
  return {
    ...src,
    colorIdx: ci,
    color: paletteFor()[ci],
    hdcp: Number(src.hdcp) || 0,
    _hdcpTouched: !!(src.hdcpSet || src._hdcpTouched),
    venmo: src.venmo || "",
    cashapp: src.cashapp || "",
    paypal: src.paypal || "",
  };
}
/* Returns whether the roster changed, so a bulk add can render once at the end
   instead of once per player. */
function _addToRoster(src) {
  if (!src || !src.name || inRoster(src.name)) return !1;
  const slot = (state.players || []).findIndex(isPlaceholderPlayer);
  if (slot < 0 && state.players.length >= 8) return !1;
  const p = _profileToPlayer(src, slot >= 0 ? slot : void 0);
  slot >= 0 ? (state.players[slot] = p) : state.players.push(p);
  return !0;
}
function addPlayer() {
  if (rosterLocked()) return;
  if (state.players.length >= 8) return void showToast("Maximum 8 players", { type: "info" });
  const ci = freeColorIdx();
  state.players.push({
    name: `Player ${state.players.length + 1}`,
    hdcp: 0,
    colorIdx: ci,
    color: paletteFor()[ci],
    venmo: "",
    cashapp: "",
    paypal: "",
  });
  renderPlayers();
}
function addPlayerFromProfile(e) {
  if (rosterLocked()) return;
  if (inRoster(e && e.name)) return;
  if (!_addToRoster(e)) return void showToast("Maximum 8 players", { type: "info" });
  haptic();
  renderPlayers();
}
function addProfileByIndex(e) {
  const t = getSavedProfiles();
  t[e] && addPlayerFromProfile(t[e]);
}
/* Golf is a standing arrangement. The same three names as last Saturday is the
   likeliest roster by a mile, so make it one tap rather than three searches. */
function lastGroupRound() {
  return (
    getAllRounds()
      .filter((r) => r && r.started && (r.players || []).length >= 2)
      .sort((a, b) => _rTime(b) - _rTime(a))[0] || null
  );
}
function lastGroupToAdd() {
  const r = lastGroupRound();
  if (!r) return [];
  const out = [],
    seen = new Set();
  (r.players || []).forEach((p) => {
    const n = p && String(p.name || "").trim();
    if (!n || inRoster(n) || seen.has(n.toLowerCase())) return;
    (seen.add(n.toLowerCase()), out.push(n));
  });
  return out;
}
function addLastGroup() {
  if (rosterLocked()) return;
  const r = lastGroupRound();
  if (!r) return;
  const profs = getSavedProfiles();
  let n = 0;
  (r.players || []).forEach((rp) => {
    if (!rp || !rp.name) return;
    const saved = profs.find(
      (p) => String(p.name || "").toLowerCase() === String(rp.name).toLowerCase(),
    );
    _addToRoster(
      saved || { name: rp.name, hdcp: rp.hdcp, colorIdx: rp.colorIdx, color: rp.color },
    ) && n++;
  });
  n
    ? (haptic(),
      renderPlayers(),
      showToast(n + " player" + (1 === n ? "" : "s") + " added from your last round.", {
        type: "success",
      }))
    : showToast("Everyone from that round is already in.", { type: "info" });
}
/* Insertion order buried the regular four under everyone ever entered. Rank by
   when you last played with someone, then by how often -- people you have never
   played with fall to the bottom alphabetically. */
function rankProfiles(list) {
  const play = {};
  getAllRounds().forEach((r) => {
    const t = _rTime(r);
    ((r && r.players) || []).forEach((p) => {
      const k =
        p &&
        String(p.name || "")
          .trim()
          .toLowerCase();
      if (!k) return;
      const e = play[k] || (play[k] = { n: 0, last: 0 });
      (e.n++, t > e.last && (e.last = t));
    });
  });
  return list
    .map((p, idx) => {
      const st = play[
        String(p.name || "")
          .trim()
          .toLowerCase()
      ] || { n: 0, last: 0 };
      return { p, idx, rounds: st.n, last: st.last };
    })
    .sort(
      (a, b) =>
        b.last - a.last ||
        b.rounds - a.rounds ||
        String(a.p.name || "").localeCompare(String(b.p.name || "")),
    );
}
/* Scores, wolf picks, pairings, team rosters and quotas are all keyed by
   player INDEX. Adding, removing or reordering players mid-round shifted
   state.players without remapping any of them, so the roster silently
   desynced from the scorecard -- remove the 2nd of 4 players after five holes
   and the 3rd player is then scored and paid with the 2nd's card, while the
   4th's scores are orphaned at an index nothing reads. Adding a player left
   state.scores[newIndex] undefined, which threw on the next tap of any score
   button. The roster is the basis of every bet already placed, so it is
   locked for the duration rather than remapped. */
function rosterLocked() {
  return (
    !!state.started &&
    (showToast(
      "The roster is locked once the round starts \u2014 every score and bet is tied to it.",
      { type: "info" },
    ),
    !0)
  );
}
function removePlayer(e) {
  if (rosterLocked()) return;
  if (state.players.length <= 1)
    return void showToast("At least 1 player required", { type: "info" });
  /* Remembered before the splice: seatMe() would otherwise seat you again the
     next time this screen opens. */
  const me = myProfileName().toLowerCase(),
    gone = state.players[e];
  me &&
    gone &&
    String(gone.name || "")
      .trim()
      .toLowerCase() === me &&
    (_unseatedMe = !0);
  (state.players.splice(e, 1), renderPlayers());
}
let _pEdit = new Set();
/* The three payment handles are set once, usually never again, but they were
   three labels and three inputs sitting permanently between the handicap and
   the bottom of the card -- 266px of edit panel where the handicap is the
   only thing anyone opens it for on the first tee. Folded away they are still
   one tap, and the summary line says which ones are filled in so collapsing
   hides the fields without hiding the information. */
let _payOpen = new Set();
function payHandleSummary(pl) {
  const set = [
    ["Venmo", pl.venmo],
    ["Cash App", pl.cashapp],
    ["PayPal", pl.paypal],
  ]
    .filter((x) => x[1] && String(x[1]).trim())
    .map((x) => x[0]);
  return set.length ? esc(set.join(" \u00b7 ")) : "none yet";
}
function togglePayFields(i) {
  _payOpen.has(i) ? _payOpen.delete(i) : _payOpen.add(i);
  const blk = document.querySelector('.pay-block[data-pidx="' + i + '"]');
  if (!blk) return void renderPlayers();
  const open = _payOpen.has(i);
  blk.classList.toggle("collapsed", !open);
  const t = blk.querySelector(".pay-toggle");
  t && t.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) blk.querySelector(".pvenmo")?.focus();
}
/* Keep the folded summary honest while it is being typed into, the same way
   the roster's handicap chip has to be repainted rather than left stale. */
function refreshPaySummary(i) {
  const blk = document.querySelector('.pay-block[data-pidx="' + i + '"]'),
    pl = state.players[i];
  if (!blk || !pl) return;
  const el = blk.querySelector(".pay-summary");
  el && (el.innerHTML = payHandleSummary(pl));
}
let _manageOpen =
  !1; /* Shown above the roster only while nobody has said who they are, and gone for
   good once they do. Settings can change it later; this is the one moment the
   question answers itself, because the names are right there being typed. */
function whoAmIPromptHTML() {
  if (!primaryPlayerIsGuess()) return "";
  const named = (state.players || []).filter(
    (p) => p && String(p.name || "").trim() && !isPlaceholderPlayer(p),
  );
  if (named.length < 2) return "";
  return (
    '<div class="whoami"><div class="whoami-k">Which one is you?</div>' +
    '<div class="whoami-row">' +
    named
      .map(
        (p) =>
          '<button type="button" class="whoami-pick" data-act="pickMe(this.dataset.name)" data-name="' +
          esc(p.name) +
          '">' +
          avatarHTML(p, 16) +
          esc(p.name) +
          "</button>",
      )
      .join("") +
    '</div><div class="whoami-why">Sets whose money the season screens are about.</div></div>'
  );
}
function pickMe(name) {
  setPrimaryPlayer(name) &&
    showToast("You’re playing as " + name + ". Change it in Settings.", { type: "success" });
}
let _pdbQuery = "",
  _pdbExpanded = !1;
const PDB_VISIBLE = 8,
  PDB_SEARCH_MIN = 8;
function expandProfileList() {
  ((_pdbExpanded = !0), renderPlayers());
}
/* Opening a player's edit drawer is pure CSS (.player-card.editing .player-edit),
   so toggle the one card's class. A full renderPlayers() here would rebuild every
   input in the roster, which drops focus and shuts the soft keyboard mid-entry. */
function togglePlayerEdit(e) {
  _pEdit.has(e) ? _pEdit.delete(e) : _pEdit.add(e);
  const c = document.querySelector('.player-card[data-pidx="' + e + '"]');
  c ? c.classList.toggle("editing", _pEdit.has(e)) : renderPlayers();
}
let _hcpToastShown = !1;
function renderPlayers() {
  if ("function" == typeof suggestHandicaps) {
    const n = suggestHandicaps();
    n &&
      !_hcpToastShown &&
      ((_hcpToastShown = !0),
      setTimeout(
        () => showToast("Handicaps set from your round history — tap to change.", { type: "info" }),
        400,
      ));
  }
  const e = document.getElementById("players-list");
  const _f = captureRosterFocus(e);
  const t = getSavedProfiles(),
    ranked = rankProfiles(t).filter((r) => !inRoster(r.p.name)),
    _q = _pdbQuery.trim().toLowerCase(),
    hits = _q
      ? ranked.filter((r) =>
          String(r.p.name || "")
            .toLowerCase()
            .includes(_q),
        )
      : ranked,
    shown = _q || _pdbExpanded ? hits : hits.slice(0, PDB_VISIBLE),
    group = lastGroupToAdd();
  let s = '<div class="saved-profiles">';
  s +=
    '<div class="saved-profiles-label">Player Database <button class="manage-profiles-btn" data-act="toggleManageProfiles()">Manage</button></div>';
  group.length &&
    (s +=
      '<button type="button" class="pdb-group" data-act="addLastGroup()">' +
      '<span class="pdb-group-k">Add last group</span>' +
      '<span class="pdb-group-n">' +
      group.map((n) => esc(n)).join(", ") +
      "</span></button>");
  t.length > PDB_SEARCH_MIN &&
    (s +=
      '<input type="text" class="pdb-search" value="' +
      esc(_pdbQuery) +
      '" placeholder="Search saved players…" aria-label="Search saved players" autocomplete="off" autocapitalize="off" spellcheck="false">');
  if (shown.length) {
    s += '<div class="saved-profiles-list">';
    shown.forEach((r) => {
      s +=
        '<button class="saved-profile-btn" data-act="addProfileByIndex(' +
        r.idx +
        ')" aria-label="Add ' +
        esc(r.p.name) +
        ", handicap " +
        fmtHdcp(r.p.hdcp) +
        (r.rounds ? ", " + r.rounds + " rounds together" : "") +
        '">' +
        avatarHTML(r.p, 8) +
        esc(r.p.name) +
        '<span class="spb-h">' +
        fmtHdcp(r.p.hdcp) +
        "</span>" +
        (r.rounds
          ? '<span class="spb-n" title="' + r.rounds + ' rounds together">' + r.rounds + "</span>"
          : "") +
        "</button>";
    });
    s += "</div>";
    hits.length > shown.length &&
      (s +=
        '<button type="button" class="pdb-more" data-act="expandProfileList()">Show all ' +
        hits.length +
        ' <i data-ico="right"></i></button>');
  } else
    s +=
      '<div class="pdb-empty hint">' +
      (_q
        ? "No saved player matches that."
        : t.length
          ? "Everyone saved is already in the roster."
          : "No saved players yet — tap Manage to add your regulars.") +
      "</div>";
  ((s +=
    '<div id="manage-profiles" class="manage-profiles' + (_manageOpen ? "" : " hidden") + '">'),
    t.forEach(function (e, t) {
      ((s += '<div class="manage-profile-row">'),
        (s += avatarHTML(e, 10)),
        (s +=
          '<input type="text" class="mp-name" value="' + esc(e.name) + '" data-idx="' + t + '">'),
        (s +=
          '<input type="text" inputmode="decimal" class="mp-hdcp" value="' +
          fmtHdcp(e.hdcp) +
          '" maxlength="5" data-idx="' +
          t +
          '" aria-label="Handicap index — type + for a plus handicap">'),
        (s +=
          '<button type="button" class="mp-color" data-idx="' +
          t +
          '" data-color="' +
          esc(playerColor(e)) +
          '" style="background:' +
          esc(playerColor(e)) +
          "\" data-act=\"openColorPicker('profile'," +
          t +
          ')" aria-label="Change color"></button>'),
        (s +=
          '<button class="mp-del" data-act="deleteProfile(' +
          t +
          ')" aria-label="Delete saved player">\u2715</button>'),
        (s += "</div>"));
    }),
    (s +=
      '<div class="mp-new"><input type="text" class="mp-new-name" placeholder="Add a player…" aria-label="New player name" maxlength="24" autocomplete="off">' +
      '<input type="text" inputmode="decimal" class="mp-new-hdcp" placeholder="Hdcp" aria-label="New player handicap index — type + for a plus handicap" maxlength="5">' +
      '<button type="button" class="btn secondary mp-new-go" data-act="addNewProfile()">Add</button></div>'),
    (s += '<div class="manage-profile-actions">'),
    (s +=
      '<button class="btn secondary" data-act="saveEditedProfiles()" style="flex:1">Save Changes</button>'),
    (s += "</div></div></div>"),
    (s += whoAmIPromptHTML()),
    state.players.forEach((t, a) => {
      s += `<div class="player-card${_pEdit.has(a) ? " editing" : ""}" data-pidx="${a}"><div class="roster-line"><button type="button" class="roster-mono" data-act="openColorPicker('roster',${a})" aria-label="Change player color">${avatarHTML(t, 26)}</button><input type="text" value="${esc(t.name)}" placeholder="Player name" aria-label="Player name" data-idx="${a}" class="pname"><span class="roster-hdcp">Hdcp <b>${t.hdcp < 0 ? "+" + Math.abs(t.hdcp) : t.hdcp}</b></span><button class="roster-edit" data-act="togglePlayerEdit(${a})" aria-label="Edit player"><i data-ico="pencil"></i></button><button class="remove-btn" data-act="removePlayer(${a})" aria-label="Remove player"><i data-ico="close"></i></button></div><div class="player-edit"><label>Handicap Index</label><div class="hdcp-input-wrap"><button data-act="adjHdcp(${a},-1)">−</button><input type="text" inputmode="decimal" class="hdcp" value="${fmtHdcp(t.hdcp)}" maxlength="5" data-idx="${a}" aria-label="Handicap index — type + for a plus handicap"><button data-act="adjHdcp(${a},1)">+</button></div><div class="pay-block${_payOpen.has(a) ? "" : " collapsed"}" data-pidx="${a}"><div class="summary-toggle pay-toggle" data-act="togglePayFields(${a})" role="button" tabindex="0" aria-expanded="${_payOpen.has(a) ? "true" : "false"}"><span>Payment handles <small class="pay-summary">${payHandleSummary(t)}</small></span><span class="toggle-arrow"><i data-ico="down"></i></span></div><div class="pay-fields"><label class="pvenmo-label">Venmo</label><input type="text" class="pvenmo" value="${esc(t.venmo || "")}" data-idx="${a}" placeholder="@handle" aria-label="Venmo username" autocapitalize="off" autocorrect="off" spellcheck="false"><label class="pvenmo-label">Cash App</label><input type="text" class="pvenmo pcashapp" value="${esc(t.cashapp || "")}" data-idx="${a}" placeholder="$cashtag" aria-label="Cash App cashtag" autocapitalize="off" autocorrect="off" spellcheck="false"><label class="pvenmo-label">PayPal</label><input type="text" class="pvenmo ppaypal" value="${esc(t.paypal || "")}" data-idx="${a}" placeholder="paypal.me name" aria-label="PayPal.me name" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div></div></div>`;
    }),
    (e.innerHTML = s),
    e.querySelectorAll(".pname").forEach((e) =>
      e.addEventListener("input", (e) => {
        state.players[+e.target.dataset.idx].name = e.target.value;
      }),
    ),
    /* Typing a name the database already knows is the same as tapping it in the
   list above, so it arrives with the handicap that was saved for it rather
   than leaving the row at 0 -- and says so, because a number that changes
   without a word looks like the app ignoring what was typed. Only an
   untouched row: a handicap entered by hand for this round wins. */
    e.querySelectorAll(".pname").forEach((el) =>
      el.addEventListener("change", (ev) => {
        const i = +ev.target.dataset.idx,
          pl = state.players[i];
        if (!pl || pl._hdcpTouched) return;
        const n = String(pl.name || "")
          .trim()
          .toLowerCase();
        if (!n) return;
        const prof = getSavedProfiles().find(
          (p) =>
            p &&
            p.hdcpSet &&
            String(p.name || "")
              .trim()
              .toLowerCase() === n,
        );
        if (!prof) return;
        ((pl.hdcp = parseHdcp(prof.hdcp)), (pl._hdcpTouched = !0), invalidateHdcpCache());
        const card = ev.target.closest(".player-card"),
          chip = card && card.querySelector(".roster-hdcp b"),
          f = card && card.querySelector(".hdcp");
        (chip && (chip.textContent = fmtHdcp(pl.hdcp)), f && (f.value = fmtHdcp(pl.hdcp)));
        showToast(
          pl.name + " plays off " + fmtHdcp(pl.hdcp) + " \u2014 from their saved profile.",
          { type: "info" },
        );
      }),
    ),
    e.querySelectorAll(".pvenmo:not(.pcashapp):not(.ppaypal)").forEach((e) =>
      e.addEventListener("input", (e) => {
        const i = +e.target.dataset.idx;
        ((state.players[i].venmo = e.target.value.trim()), refreshPaySummary(i));
      }),
    ),
    e.querySelectorAll(".pcashapp").forEach((e) =>
      e.addEventListener("input", (e) => {
        const i = +e.target.dataset.idx;
        ((state.players[i].cashapp = e.target.value.trim()), refreshPaySummary(i));
      }),
    ),
    e.querySelectorAll(".ppaypal").forEach((e) =>
      e.addEventListener("input", (e) => {
        const i = +e.target.dataset.idx;
        ((state.players[i].paypal = e.target.value.trim()), refreshPaySummary(i));
      }),
    ),
    /* The row's "Hdcp N" chip is the only confirmation that a typed handicap
   landed, and it sits OUTSIDE the edit panel the field lives in. adjHdcp()
   repaints it on every tap of -/+, but typing only wrote to state, and
   nothing repaints the roster until a player is added or removed. So
   entering a handicap by hand left the row still reading "Hdcp 0": the
   number was stored and used in the money, while every visible sign said it
   had been ignored. Echo it back into the field too, so "12abc" and " 12 "
   show the 12 they actually parsed to rather than inviting a second go. */
    e.querySelectorAll(".hdcp").forEach((el) =>
      el.addEventListener("change", (ev) => {
        const i = +ev.target.dataset.idx,
          pl = state.players[i];
        if (!pl) return;
        ((pl.hdcp = parseHdcp(ev.target.value)), (pl._hdcpTouched = !0), invalidateHdcpCache());
        const card = ev.target.closest(".player-card"),
          chip = card && card.querySelector(".roster-hdcp b");
        chip && (chip.textContent = fmtHdcp(pl.hdcp));
        ev.target.value = fmtHdcp(pl.hdcp);
        rememberIfMine(pl);
      }),
    ));
  const _sb = e.querySelector(".pdb-search");
  _sb &&
    _sb.addEventListener("input", (ev) => {
      ((_pdbQuery = ev.target.value), (_pdbExpanded = !1), renderPlayers());
    });
  const _nn = e.querySelector(".mp-new-name"),
    _nh = e.querySelector(".mp-new-hdcp");
  [_nn, _nh].forEach(
    (el) =>
      el &&
      el.addEventListener("keydown", (ev) => {
        "Enter" === ev.key && (ev.preventDefault(), addNewProfile());
      }),
  );
  restoreRosterFocus(e, _f);
  syncWolfUnevenOpts();
}
/* Rebuilding the roster replaces every input node, so a render triggered while
   someone is mid-entry would otherwise blur the field they are typing in --
   on a phone that closes the keyboard and loses their place. Remember which
   field held the caret and put it back. */
function captureRosterFocus(root) {
  const a = document.activeElement;
  if (!root || !a || a === root || !root.contains(a)) return null;
  const o = { cls: a.className || "", idx: a.dataset ? a.dataset.idx : void 0 };
  try {
    ((o.start = a.selectionStart), (o.end = a.selectionEnd));
  } catch (e) {}
  return o;
}
function restoreRosterFocus(root, f) {
  if (!root || !f || !f.cls) return;
  const sel =
    "." +
    f.cls.trim().split(/\s+/).join(".") +
    (void 0 !== f.idx ? '[data-idx="' + f.idx + '"]' : "");
  let el = null;
  try {
    el = root.querySelector(sel);
  } catch (e) {}
  if (!el) return;
  el.focus();
  if (null != f.start)
    try {
      el.setSelectionRange(f.start, f.end);
    } catch (e) {}
}
function parseHdcp(v) {
  const raw = String(null == v ? "" : v).trim();
  if (!raw) return 0;
  const m = /^([+-])?\s*(\d+(?:\.\d+)?|\.\d+)$/.exec(raw);
  let n = m ? parseFloat(m[2]) : parseFloat(raw);
  if (!isFinite(n)) return 0;
  if (m && m[1]) n = -Math.abs(n);
  return Math.max(-10, Math.min(54, Math.round(10 * n) / 10));
}
function fmtHdcp(n) {
  const v = Math.round(10 * (Number(n) || 0)) / 10;
  return v < 0 ? "+" + Math.abs(v) : String(v);
}
function toggleErHdcpSign(btn) {
  const inp = btn.parentNode.querySelector(".er-phdcp");
  if (!inp) return;
  ((inp.value = fmtHdcp(-parseHdcp(inp.value))), haptic());
}
/* The -/+ handicap steppers get tapped in bursts, so they patch the two spots
   that actually changed instead of rebuilding the roster on every tap. */
function adjHdcp(e, t) {
  const a = state.players[e].hdcp;
  ((state.players[e]._hdcpTouched = !0),
    (state.players[e].hdcp =
      Math.round(10 * Math.max(-10, Math.min(54, (Number.isNaN(a) ? 0 : a) + t))) / 10),
    invalidateHdcpCache());
  const p = state.players[e],
    c = document.querySelector('.player-card[data-pidx="' + e + '"]');
  if (!c) return void renderPlayers();
  const i = c.querySelector(".hdcp");
  i && (i.value = fmtHdcp(p.hdcp));
  const b = c.querySelector(".roster-hdcp b");
  b && (b.textContent = p.hdcp < 0 ? "+" + Math.abs(p.hdcp) : String(p.hdcp));
  rememberIfMine(p);
}
function movePlayer(e, t) {
  if (rosterLocked()) return;
  const a = e + t;
  if (a < 0 || a >= state.players.length) return;
  const s = state.players[e];
  ((state.players[e] = state.players[a]), (state.players[a] = s), renderPlayers());
}
document.addEventListener("DOMContentLoaded", () => {
  (flushActiveRound(),
    applyOfflineChip(),
    addEventListener("online", applyOfflineChip),
    addEventListener("offline", applyOfflineChip));
  /* The SDK is fetched here, off the critical path, once the first screen is
     up. Offline there is nothing to fetch and the request would only stall, so
     wait for a connection instead -- which is also how a phone that finds
     signal on the 4th tee picks sync back up without a relaunch. */
  const _fb = () => {
    if (!1 !== navigator.onLine) ensureFirebase();
  };
  addEventListener("online", _fb);
  "function" == typeof requestIdleCallback
    ? requestIdleCallback(_fb, { timeout: 3000 })
    : setTimeout(_fb, 1200);
  /* Scores save on a 1s debounce, and a phone backgrounding the PWA -- or iOS
     evicting the tab outright -- kills the pending timer with it. Flush on the
     way out. pagehide is the one iOS fires reliably; visibilitychange covers
     the ordinary app-switch. */
  const _flush = () => {
    try {
      state.started && !isSpectator && (clearTimeout(_saveTimer), saveCurrentRound());
    } catch (e) {}
  };
  (addEventListener("pagehide", _flush),
    document.addEventListener("visibilitychange", () => {
      "hidden" === document.visibilityState && _flush();
    }));
  "serviceWorker" in navigator &&
    (navigator.serviceWorker.register("./sw.js").catch(() => {}),
    navigator.serviceWorker.addEventListener("message", (e) => {
      "shell-updated" === e.data?.type &&
        !_updatePrompted &&
        ((_updatePrompted = !0),
        showToast("New version ready — tap to reload", {
          type: "info",
          persistent: !0,
          onClick: () => location.reload(),
        }));
    }),
    navigator.serviceWorker.ready
      .then((r) => {
        const ask = () => r.active?.postMessage({ type: "check-update" });
        (ask(), setTimeout(ask, 1500));
      })
      .catch(() => {}));
  initDarkMode();
  applyAuthBannerPref();
  applyCachedAuth();
  const _wc = new URLSearchParams(location.search).get("watch");
  _wc && "function" == typeof startSpectator
    ? startSpectator(_wc)
    : (enterScreen("home", { noPush: !0 }), checkOnboarding());
  const t = localStorage.getItem("defaultGame"),
    a = localStorage.getItem("defaultHoles");
  if (t) {
    state.gameType = t;
    const e = document.getElementById("game-type");
    e && (e.value = t);
    "function" == typeof selectGameType && selectGameType(t);
  }
  (a && ((state.holeCount = +a), setHoleCount(+a)),
    buildParGrid(),
    addPlayer(),
    addPlayer(),
    addPlayer(),
    addPlayer(),
    seatMe(),
    updateGameOptions(),
    document.getElementById("game-type").addEventListener("change", updateGameOptions),
    document.getElementById("add-player-btn").addEventListener("click", addPlayer),
    updateNavCounts(),
    renderResumeCard(),
    document.getElementById("start-btn").addEventListener("click", continueToGame),
    document
      .getElementById("prev-hole")
      .addEventListener("click", () => goToHole(state.currentHole - 1)),
    document
      .getElementById("next-hole")
      .addEventListener("click", () => goToHole(state.currentHole + 1)),
    document.getElementById("scorecard-btn").addEventListener("click", showScorecard),
    document.getElementById("standings-btn").addEventListener("click", showStandings));
  let s = 0,
    n = 0;
  const o = document.getElementById("scoring-screen");
  (o.addEventListener(
    "touchstart",
    (e) => {
      ((s = e.touches[0].clientX), (n = e.touches[0].clientY));
    },
    { passive: !0 },
  ),
    o.addEventListener(
      "touchend",
      (e) => {
        const t = e.changedTouches[0].clientX - s,
          a = e.changedTouches[0].clientY - n;
        Math.abs(t) > 60 &&
          Math.abs(t) > 1.5 * Math.abs(a) &&
          goToHole(t < 0 ? state.currentHole + 1 : state.currentHole - 1);
      },
      { passive: !0 },
    ));
});
let _dragIdx = null;
function dragPlayer(e, t) {
  ((_dragIdx = t), (e.dataTransfer.effectAllowed = "move"));
}
function dropPlayer(e, t) {
  if ((e.preventDefault(), null === _dragIdx || _dragIdx === t)) return;
  if (rosterLocked()) return void (_dragIdx = null);
  const a = state.players.splice(_dragIdx, 1)[0];
  (state.players.splice(t, 0, a), (_dragIdx = null), renderPlayers());
}
function toggleManageProfiles() {
  _manageOpen = !_manageOpen;
  const e = document.getElementById("manage-profiles");
  e && e.classList.toggle("hidden");
}
async function deleteProfile(e) {
  if (
    !(await appConfirm("Delete this saved player?", {
      title: "Delete Player",
      confirmLabel: "Delete",
      danger: !0,
    }))
  )
    return;
  const t = getSavedProfiles();
  (t.splice(e, 1), safeSetItem("golfProfiles", JSON.stringify(t)), renderPlayers());
}
function saveEditedProfiles() {
  const e = getSavedProfiles();
  /* data-idx addresses the saved-profile list, not the roster. The colour loop
     used to write state.players[idx] -- `idx` is declared nowhere, so every tap
     on "Save Changes" threw a ReferenceError before reaching safeSetItem, and
     the name and handicap edits above it were silently discarded too. Names are
     captured first so a renamed profile can still be matched to the player of
     that name currently in the round. */
  const was = e.map((p) => p.name);
  (document.querySelectorAll(".mp-name").forEach((t) => {
    const a = +t.dataset.idx;
    e[a] && (e[a].name = t.value.trim());
  }),
    document.querySelectorAll(".mp-hdcp").forEach((t) => {
      const a = +t.dataset.idx;
      if (e[a]) {
        e[a].hdcp = parseHdcp(t.value);
      }
    }),
    document.querySelectorAll(".mp-color").forEach((t) => {
      const a = +t.dataset.idx;
      if (e[a] && t.dataset.color) {
        e[a].color = t.dataset.color;
        const ci = nearestColorIdx(t.dataset.color);
        (state.players || []).forEach((p) => {
          p && p.name === was[a] && ((p.colorIdx = ci), (p.color = t.dataset.color));
        });
      }
    }),
    safeSetItem("golfProfiles", JSON.stringify(e)),
    (_manageOpen = !1),
    renderPlayers(),
    showToast("Player database saved", { type: "success" }));
} /* Adding a regular used to be two modal prompts back to back -- one for the
   name, one for the handicap -- to record one person. It is one row now, and
   because you are standing on the setup screen building a roster, the new
   player joins the round as well as the database. */
function addNewProfile() {
  const nameEl = document.querySelector(".mp-new-name"),
    hdcpEl = document.querySelector(".mp-new-hdcp");
  if (!nameEl) return;
  const name = String(nameEl.value || "").trim();
  if (!name)
    return (nameEl.focus(), void showToast("Give the player a name first.", { type: "info" }));
  const list = getSavedProfiles();
  if (
    list.some(
      (p) =>
        String(p.name || "")
          .trim()
          .toLowerCase() === name.toLowerCase(),
    )
  )
    return (
      nameEl.select(),
      void showToast(name + " is already in the database.", { type: "info" })
    );
  const hdcp = parseHdcp(hdcpEl ? hdcpEl.value : 0),
    prof = {
      name,
      hdcp,
      colorIdx: list.length % 8,
      color: paletteFor()[list.length % 8],
      venmo: "",
      cashapp: "",
      paypal: "",
    };
  (list.push(prof), safeSetItem("golfProfiles", JSON.stringify(list)));
  const joined = !state.started && _addToRoster(prof);
  ((nameEl.value = ""),
    hdcpEl && (hdcpEl.value = ""),
    (_pdbQuery = ""),
    (_manageOpen = !0),
    haptic(),
    renderPlayers());
  const back = document.querySelector(".mp-new-name");
  back && back.focus();
  showToast(
    joined ? name + " added to the database and this round." : name + " saved to the database.",
    { type: "success" },
  );
}
