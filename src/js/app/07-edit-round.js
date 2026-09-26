function gameStakeLabel(g) {
  const o = "function" == typeof readGameOpts && state.gameType === g ? readGameOpts() : null;
  if (!o) return "";
  if ("nassau" === g)
    return "$" + (o.front || 0) + " · $" + (o.back || 0) + " · $" + (o.overall || 0);
  if ("skins" === g) return "$" + (o.skinVal || 0) + " / hole" + (o.carry ? " · carries" : "");
  if ("wolf" === g) return "$" + (o.wolfVal || 0) + " / point";
  if ("match" === g) return "$" + (o.holeVal || 0) + " / hole";
  if ("stableford" === g) return "$" + (o.ptVal || 0) + " / point";
  if ("bingo" === g) return "$" + (o.ptVal || 0) + " / point";
  if ("dots" === g) return "$" + (o.dotVal || 0) + " / dot";
  if ("snake" === g) return "$" + (o.potVal || 0) + " pot";
  if ("vegas" === g) return "$" + (o.vegasVal || 0) + " / point";
  if ("sixes" === g) return "$" + (o.sixesVal || 0) + " / segment";
  if ("banker" === g) return "$" + (o.bankerVal || 0) + " / hole";
  return "";
}
/* Edit Round — the roster count and order stay locked once a round starts
   (every score is keyed to a player index), but names, handicaps, the round
   name, and the money stakes are safe to change mid-round: net scores and all
   payouts are recomputed from these values, so editing then re-rendering keeps
   the running money correct. */
function editRoundStakeFields() {
  const g = state.gameType,
    o = state.gameOpts || {},
    f = [];
  const add = (k, l) => {
    if (o[k] != null) f.push({ key: k, label: l, val: o[k] });
  };
  if ("nassau" === g) {
    (add("front", "Front 9"),
      add("back", "Back 9"),
      add("overall", "Overall"),
      o.press && add("pressVal", "Press"));
  } else if ("skins" === g) add("skinVal", "Per skin");
  else if ("match" === g) {
    "nassau" === o.matchFormat
      ? (add("matchFront", "Front 9"), add("matchBack", "Back 9"), add("matchOverall", "Overall"))
      : (add("holeVal", "Per hole"), add("matchPressVal", "Press"));
  } else if ("stableford" === g) add("ptVal", "Per point");
  else if ("bingo" === g) add("ptVal", "Per point");
  else if ("dots" === g) add("dotVal", "Per dot");
  else if ("wolf" === g) {
    (add("wolfVal", "Per point"), add("wolfTeamVal", "Team point"), add("fieldVal", "Field point"));
  } else if ("vegas" === g) add("vegasVal", "Per point");
  else if ("snake" === g) add("potVal", "Pot");
  else if ("sixes" === g) add("sixesVal", "Per segment");
  else if ("banker" === g) add("bankerVal", "Per hole");
  return f;
}
function showEditRound() {
  if (isSpectator)
    return void showToast("You're watching — editing is disabled.", { type: "info" });
  if (!state.started) return void showToast("Start a round first.", { type: "info" });
  const el = document.getElementById("edit-round-content");
  if (!el) return;
  let s =
    '<div class="er-section"><label class="er-label" for="er-course">Round name</label><input type="text" id="er-course" class="er-input" value="' +
    esc(state.course || "") +
    '" maxlength="40" placeholder="Round"></div>';
  s +=
    '<div class="er-section"><div class="er-head">Players</div><div class="hint" style="margin:-2px 0 8px">Names and handicaps only — you can’t add, remove, or reorder players mid-round.</div>';
  state.players.forEach((p, i) => {
    s +=
      '<div class="er-player-row"><input type="text" class="er-pname" data-idx="' +
      i +
      '" value="' +
      esc(p.name) +
      '" maxlength="24" placeholder="Player ' +
      (i + 1) +
      '" aria-label="Player ' +
      (i + 1) +
      ' name"><span class="er-hdcp-wrap">Hdcp <input type="text" inputmode="decimal" class="er-phdcp" data-idx="' +
      i +
      '" value="' +
      fmtHdcp(p.hdcp) +
      '" maxlength="5" aria-label="Player ' +
      (i + 1) +
      ' handicap — type + for a plus handicap"><button type="button" class="reorder-btn" data-act="toggleErHdcpSign(this)" aria-label="Toggle plus handicap for player ' +
      (i + 1) +
      '" title="Plus handicap">\u00b1</button></span></div>';
  });
  s += "</div>";
  if (erWolfOrderActive()) {
    s +=
      '<div class="er-section"><div class="er-head">Wolf order</div><div class="hint" style="margin:-2px 0 8px">Drag a player to change who is Wolf on each hole. Holes already played keep the Wolf they were played with.</div><div id="er-wolf-order"></div></div>';
  }
  const stakes = editRoundStakeFields();
  if (stakes.length) {
    s +=
      '<div class="er-section"><div class="er-head">' +
      esc(GAME_NAMES[state.gameType] || state.gameType || "") +
      " stakes ($)</div>";
    stakes.forEach((f) => {
      s +=
        '<label class="er-stake-row"><span>' +
        esc(f.label) +
        '</span><input type="number" inputmode="decimal" class="er-stake" data-key="' +
        f.key +
        '" value="' +
        f.val +
        '" min="1" step="1"></label>';
    });
    s += "</div>";
  }
  const sb = state.sideBets || {},
    sbLabels = { skins: "Skins (per skin)", snake: "Snake (pot)", junk: "Junk / Dots (per dot)" },
    sbKeys = Object.keys(SIDE_BET_DEFAULTS).filter((k) => sb[k] && sb[k].on);
  if (sbKeys.length) {
    s += '<div class="er-section"><div class="er-head">Side bets ($)</div>';
    sbKeys.forEach((k) => {
      s +=
        '<label class="er-stake-row"><span>' +
        esc(sbLabels[k] || k) +
        '</span><input type="number" inputmode="decimal" class="er-sb" data-key="' +
        k +
        '" value="' +
        (sb[k].val || 0) +
        '" min="0" step="1"></label>';
    });
    s += "</div>";
  }
  el.innerHTML = s;
  if (erWolfOrderActive()) {
    (erWolfOrderInit(), renderErWolfOrder());
    const _wb = document.getElementById("er-wolf-order");
    _wb && _wb.addEventListener("pointerdown", erWolfDragStart);
  }
  document.getElementById("edit-round-modal").classList.remove("hidden");
  openModalA11y("edit-round-modal");
}
let _erWolfOrder = null,
  _erWolfDrag = null;
function erWolfOrderActive() {
  return (
    "wolf" === state.gameType &&
    !(state.gameOpts && state.gameOpts.fixedPairs) &&
    state.players.length > 1
  );
}
function erWolfOrderInit() {
  const n = state.players.length,
    src = state.gameOpts && state.gameOpts.wolfOrder;
  _erWolfOrder =
    Array.isArray(src) &&
    src.length === n &&
    new Set(src).size === n &&
    src.every((i) => Number.isInteger(i) && i >= 0 && i < n)
      ? [...src]
      : state.players.map((p, i) => i);
}
function renderErWolfOrder() {
  const box = document.getElementById("er-wolf-order");
  if (!box || !_erWolfOrder) return;
  box.innerHTML = _erWolfOrder
    .map(
      (pi, pos) =>
        '<div class="er-wolf-row" data-pos="' +
        pos +
        '"><span class="er-wolf-grip" aria-hidden="true">\u283f</span><span class="er-wolf-pos">' +
        (pos + 1) +
        "</span>" +
        avatarHTML(state.players[pi], 10) +
        '<span class="er-wolf-name">' +
        esc(state.players[pi].name) +
        '</span><span class="er-wolf-btns"><button type="button" class="reorder-btn" data-act="moveErWolf(' +
        pos +
        ',-1)"' +
        (0 === pos ? " disabled" : "") +
        ' aria-label="Move earlier"><i data-ico="up"></i></button><button type="button" class="reorder-btn" data-act="moveErWolf(' +
        pos +
        ',1)"' +
        (pos === _erWolfOrder.length - 1 ? " disabled" : "") +
        ' aria-label="Move later"><i data-ico="down"></i></button></span></div>',
    )
    .join("");
}
function moveErWolf(pos, d) {
  if (!_erWolfOrder) return;
  const to = pos + d;
  if (to < 0 || to >= _erWolfOrder.length) return;
  const it = _erWolfOrder.splice(pos, 1)[0];
  (_erWolfOrder.splice(to, 0, it), haptic(), renderErWolfOrder());
}
function _erWolfRowAt(y) {
  const rows = [...document.querySelectorAll("#er-wolf-order .er-wolf-row")];
  for (let i = 0; i < rows.length; i++) {
    if (y < rows[i].getBoundingClientRect().bottom) return i;
  }
  return rows.length - 1;
}
function erWolfDragStart(e) {
  if (!_erWolfOrder || !e.target.closest) return;
  const row = e.target.closest(".er-wolf-row");
  if (!row || e.target.closest("button")) return;
  ((_erWolfDrag = { pos: +row.dataset.pos }),
    row.classList.add("dragging"),
    document.addEventListener("pointermove", erWolfDragMove, { passive: !1 }),
    document.addEventListener("pointerup", erWolfDragEnd),
    document.addEventListener("pointercancel", erWolfDragEnd),
    e.preventDefault());
}
function erWolfDragMove(e) {
  if (!_erWolfDrag) return;
  e.preventDefault();
  const to = _erWolfRowAt(e.clientY);
  if (to < 0 || to === _erWolfDrag.pos) return;
  const it = _erWolfOrder.splice(_erWolfDrag.pos, 1)[0];
  (_erWolfOrder.splice(to, 0, it), (_erWolfDrag.pos = to), haptic(), renderErWolfOrder());
  const r = document.querySelectorAll("#er-wolf-order .er-wolf-row")[to];
  r && r.classList.add("dragging");
}
function erWolfDragEnd() {
  if (!_erWolfDrag) return;
  ((_erWolfDrag = null),
    document.removeEventListener("pointermove", erWolfDragMove),
    document.removeEventListener("pointerup", erWolfDragEnd),
    document.removeEventListener("pointercancel", erWolfDragEnd),
    renderErWolfOrder());
}
function saveEditRound() {
  if (isSpectator || !state.started) return;
  const nameInputs = [...document.querySelectorAll("#edit-round-content .er-pname")],
    names = nameInputs.map((i) => i.value.trim());
  if (names.some((n) => !n)) return void showToast("Every player needs a name.", { type: "error" });
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    return void showToast("Player names must be unique.", { type: "error" });
  nameInputs.forEach((inp) => {
    const i = +inp.dataset.idx;
    state.players[i] && (state.players[i].name = inp.value.trim());
  });
  document.querySelectorAll("#edit-round-content .er-phdcp").forEach((inp) => {
    const i = +inp.dataset.idx;
    state.players[i] &&
      ((state.players[i].hdcp = parseHdcp(inp.value)), (state.players[i]._hdcpTouched = !0));
  });
  const cn = document.getElementById("er-course");
  cn && (state.course = cn.value.trim() || "Round");
  state.gameOpts = state.gameOpts || {};
  if (erWolfOrderActive() && _erWolfOrder) {
    const _prev = state.gameOpts.wolfOrder;
    if (
      !Array.isArray(_prev) ||
      _prev.length !== _erWolfOrder.length ||
      _erWolfOrder.some((v, i) => _prev[i] !== v)
    ) {
      state.gameOpts.wolfOrder = [..._erWolfOrder];
      for (let h = state.currentHole; h < maxHole(); h++) {
        const wh = state.wolfHoles[h];
        if (wh && Number.isInteger(wh.wolf) && wh.wolf !== getWolfForHole(h))
          delete state.wolfHoles[h];
      }
    }
  }
  document.querySelectorAll("#edit-round-content .er-stake").forEach((inp) => {
    state.gameOpts[inp.dataset.key] = Math.max(1, +inp.value || 1);
  });
  document.querySelectorAll("#edit-round-content .er-sb").forEach((inp) => {
    const k = inp.dataset.key;
    state.sideBets && state.sideBets[k] && (state.sideBets[k].val = Math.max(0, +inp.value || 0));
  });
  (invalidateHdcpCache(),
    invalidateMoneyCache(),
    saveCurrentRound(),
    syncEditedRoundLive(),
    renderStrokeSummary(),
    renderHole(),
    closeModal("edit-round-modal"),
    showToast("Round updated.", { type: "success" }));
}
function syncEditedRoundLive() {
  try {
    state.liveId &&
      "undefined" != typeof db &&
      db &&
      currentUser &&
      db
        .collection("liveRounds")
        .doc(state.liveId)
        .update({
          course: state.course,
          players: stripPayHandles(state.players),
          gameOpts: state.gameOpts,
          sideBets: state.sideBets || defaultSideBets(),
          hdcps: state.hdcps,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch(() => {});
  } catch (e) {}
}
// Fill each card with its real rules copy once, so the picker teaches the game.
function dockGameOptions() {
  const opts = document.getElementById("game-options"),
    desc = document.getElementById("game-desc"),
    sel = document.querySelector("#game-grid .game-card.selected"),
    grid = document.getElementById("game-grid");
  if (!opts || !grid) return;
  // No selection (or "none"): park the block back after the grid.
  if (!sel) {
    (grid.after(opts), desc && grid.after(desc));
    return;
  }
  (sel.after(opts), desc && sel.after(desc));
}
