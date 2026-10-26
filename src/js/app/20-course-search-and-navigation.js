let searchTimeout = null;
function getSavedCourses() {
  return safeParseJSON(localStorage.getItem("golfCourses"), []);
}
function saveCourse() {
  const e = document.getElementById("course-name").value?.trim();
  if (!e) return void showToast("Enter a course name first.", { type: "error" });
  const t = {
      name: e,
      city: "",
      state: "Custom",
      saved: !0,
      pars: [...state.pars],
      hdcps: [...state.hdcps],
      // The tees with a rating and slope, so the course comes back stroking right.
      tees: editTees()
        .filter(teeUsable)
        .map((x, i) => ({
          name: x.name || "Tee " + (i + 1),
          rating: x.rating,
          slope: x.slope,
          ...(x.yds ? { yds: x.yds } : {}),
        })),
    },
    a = getSavedCourses(),
    s = a.findIndex((t) => t.name.toLowerCase() === e.toLowerCase());
  (s >= 0 ? (a[s] = t) : a.push(t),
    safeSetItem("golfCourses", JSON.stringify(a)),
    showToast(`"${e}" saved! It will appear in search next time.`, { type: "success" }));
}
async function deleteSavedCourse(e) {
  const s = window._courseResults[e];
  if (!s) return;
  if (
    !(await appConfirm("Delete this saved course?", {
      title: "Delete Course",
      confirmLabel: "Delete",
      danger: !0,
    }))
  )
    return;
  const t = getSavedCourses().filter((t) => t.name !== s.name);
  safeSetItem("golfCourses", JSON.stringify(t));
  const a = document.getElementById("course-search");
  a.value.trim().length >= 2 && searchCourses(a.value.trim().toLowerCase());
}
function searchCourses(e) {
  const t = document.getElementById("course-results"),
    a = [...getSavedCourses(), ...COURSE_DB]
      .filter(
        (t) =>
          t.name.toLowerCase().includes(e) ||
          t.city.toLowerCase().includes(e) ||
          t.state.toLowerCase().includes(e),
      )
      .slice(0, 10);
  if (!a.length)
    return (
      (t.innerHTML =
        '<div class="course-item loading">Not in the course list yet.</div><button type="button" class="course-item course-typed" data-act="useTypedCourse()">Play “' +
        esc(document.getElementById("course-search").value.trim()) +
        "” with par 72 and fix the pars as you go</button>"),
      void t.classList.remove("hidden")
    );
  window._courseResults = a;
  ((t.innerHTML = a
    .map((e, t) => {
      const a = e.saved,
        s = e.city ? `${esc(e.city)}, ${esc(e.state)}` : "Custom",
        n = e.tees?.length ? ` · ${e.tees.length} tees` : "";
      return `<div class="course-item" data-act="selectCourse(${t})" role="button" tabindex="0">\n      <div class="course-item-name">${a ? "" : ""}${esc(e.name)}</div>\n      <div class="course-item-loc">${s} · Par ${((e) => e.pars.slice(0, state.holeCount).reduce((e, t) => e + t, 0))(e)}${n}${a ? '<button class="course-del-btn" data-act="event.stopPropagation();deleteSavedCourse(' + t + ')" aria-label="Delete saved course"><i data-ico="close"></i></button>' : ""}</div>\n    </div>`;
    })
    .join("")),
    t.classList.remove("hidden"));
}
function selectCourse(e) {
  const t = window._courseResults[e];
  if (!t) return;
  // A copy: correcting a tee's numbers must not rewrite the built-in list.
  ((window._selectedCourse = JSON.parse(JSON.stringify(t))),
    (document.getElementById("course-name").value = t.name),
    (document.getElementById("course-search").value = ""),
    document.getElementById("course-results").classList.add("hidden"));
  const a = t.pars.reduce((e, t) => e + t, 0),
    s = document.getElementById("selected-course");
  /* The first tee is drawn selected, so it is the round's tee until another is
     tapped. It used to be drawn selected and left unset -- the round played
     off no slope at all, or off the last course's tee. */
  ((_teeIdx = t.tees && t.tees.length ? 0 : null),
    (state.selectedTee = null != _teeIdx ? teeForRound(0) : null),
    clearPlayerTees(),
    "function" == typeof renderPlayers && renderPlayers());
  (s.classList.remove("hidden"),
    (s.innerHTML = `<div class="selected-course-info">\n    <div class="selected-course-name">${esc(t.name)}</div>\n    <div class="selected-course-loc">${esc(t.city)}, ${esc(t.state)} · Par ${a}</div>\n  </div>\n  <div class="tee-selector">\n    <label id="tee-select-label">Select Tees</label>\n    <div class="tee-options" id="tee-options" role="group" aria-labelledby="tee-select-label">\n      ${teeOptionsHTML(t, 0)}\n    </div>\n  </div>\n  <button class="btn small secondary" data-act="clearCourse()" style="margin-top:8px;width:100%"><i data-ico="close"></i> Clear Selection</button>\n  <div class="verify-note">Verify yardage & ratings against your scorecard. Pars & handicaps are editable below.</div>`),
    applyCoursePars(),
    buildParGrid(),
    setParDetailCollapsed(!0));
}
function teeOptionsHTML(c, active) {
  return c.tees
    .map(
      (e, t) =>
        `<div class="tee-option ${t === active ? "active" : ""}" data-act="selectTee(${t})" data-tee="${t}" role="button" tabindex="0"><div class="tee-color-bar" style="background:${teeColor(e.name || "")}"></div><div class="tee-details"><div class="tee-name">${esc(e.name || "Tee " + (t + 1))}</div><div class="tee-stats">${e.yds ? e.yds.toLocaleString() + " yds · " : ""}${e.rating || "–"}/${e.slope || "–"}</div></div></div>`,
    )
    .join("");
}
// A course's tee, with the 18-hole par its rating is measured against.
function courseTee(c, i) {
  return { ...c.tees[i], par: c.pars.reduce((a, b) => a + b, 0) };
}
// A roster carried over from another round drops the tees it was stamped with.
function clearPlayerTees() {
  (state.players || []).forEach((p) => p && delete p.tee);
  invalidateHdcpCache();
}
function teeColor(e) {
  const t = e.toLowerCase();
  return t.includes("black") || t.includes("championship")
    ? "#1a1a2e"
    : t.includes("blue")
      ? "#1565c0"
      : t.includes("white")
        ? "#bdbdbd"
        : t.includes("gold") || t.includes("yellow")
          ? "#f9a825"
          : t.includes("green")
            ? "#2e7d32"
            : t.includes("red")
              ? "#c62828"
              : "#78909c";
}
function selectTee(e) {
  const t = window._selectedCourse;
  t &&
    (document.querySelectorAll(".tee-option").forEach((t, a) => {
      t.classList.toggle("active", a === e);
    }),
    (_teeIdx = t.tees[e] ? e : null),
    (state.selectedTee = teeForRound(e)),
    clearPlayerTees(),
    "function" == typeof renderPlayers && renderPlayers(),
    applyCoursePars(),
    buildParGrid(),
    setParDetailCollapsed(!0));
}
function clearCourse() {
  ((window._selectedCourse = null),
    (window._manualTees = []),
    (_teeIdx = null),
    document.getElementById("selected-course").classList.add("hidden"),
    (document.getElementById("course-name").value = ""),
    (state.pars = [...STANDARD_PARS]),
    (state.hdcps = [...STANDARD_HDCP]),
    (state.selectedTee = null),
    clearPlayerTees(),
    invalidateHdcpCache(),
    buildParGrid(),
    setParDetailCollapsed(!1));
}
/* Tees, rating and slope, editable. The strokes come from the slope and
   rating of the tees the group plays, so a wrong number on the built-in list
   or a course typed in by hand (which had nowhere to put them at all) means
   the wrong strokes. The list edited is the selected course's own copy, or a
   typed course's; it is saved with the course. The highlighted tee is the
   one the round plays. */
let _teeIdx = null;
// WHS bounds for slope; course ratings for 18 holes sit well inside these.
const SLOPE_MIN = 55,
  SLOPE_MAX = 155,
  RATING_MIN = 50,
  RATING_MAX = 85;
function editTees() {
  return window._selectedCourse
    ? (window._selectedCourse.tees = window._selectedCourse.tees || [])
    : (window._manualTees = window._manualTees || []);
}
function teeUsable(t) {
  return (
    !!t &&
    t.rating >= RATING_MIN &&
    t.rating <= RATING_MAX &&
    t.slope >= SLOPE_MIN &&
    t.slope <= SLOPE_MAX
  );
}
// The round's tee from list entry i, with the 18-hole par its rating is against.
function teeForRound(i) {
  const c = window._selectedCourse,
    t = editTees()[i];
  if (!teeUsable(t)) return null;
  const ps = c && c.pars && c.pars.length >= 18 ? c.pars : state.pars,
    par = ps.length >= 18 ? ps.slice(0, 18).reduce((a, b) => a + b, 0) : 72;
  return { ...t, name: t.name || "Tee " + (i + 1), par };
}
// After any tee edit: re-point the round's tee and redraw what shows it.
function refreshSelectedTee() {
  ((state.selectedTee = null != _teeIdx ? teeForRound(_teeIdx) : null), clearPlayerTees());
  const box = document.getElementById("tee-options");
  box &&
    window._selectedCourse &&
    (box.innerHTML = teeOptionsHTML(window._selectedCourse, _teeIdx));
  "function" == typeof renderPlayers && document.getElementById("players-list") && renderPlayers();
}
function renderTeeEditor() {
  const el = document.getElementById("tee-editor");
  if (!el) return;
  const list = editTees();
  let h = list.length
    ? ""
    : '<p class="hint">No tees yet. Add the tees you are playing, with the rating and slope from the scorecard, so strokes come from your course handicap.</p>';
  list.length &&
    (h +=
      '<div class="tee-edit-row tee-edit-head" aria-hidden="true"><span>Play</span><span>Tees</span><span>Rating</span><span>Slope</span><span></span></div>');
  list.forEach((t, i) => {
    const on = i === _teeIdx,
      n = esc(t.name || "Tee " + (i + 1));
    h +=
      '<div class="tee-edit-row' +
      (on ? " active" : "") +
      (teeUsable(t) ? "" : " unusable") +
      '"><button type="button" class="tee-play" data-act="playTee(' +
      i +
      ')" aria-pressed="' +
      on +
      '" aria-label="Play the ' +
      n +
      ' tees" title="Play these tees">' +
      (on ? '<i data-ico="check"></i>' : "") +
      '</button><input type="text" class="te-name" data-i="' +
      i +
      '" value="' +
      esc(t.name || "") +
      '" placeholder="Tee name" maxlength="20" aria-label="Tee name"><input type="text" inputmode="decimal" class="te-rating" data-i="' +
      i +
      '" value="' +
      (null != t.rating ? t.rating : "") +
      '" placeholder="Rating" maxlength="4" aria-label="' +
      n +
      ' course rating"><input type="text" inputmode="numeric" class="te-slope" data-i="' +
      i +
      '" value="' +
      (null != t.slope ? t.slope : "") +
      '" placeholder="Slope" maxlength="3" aria-label="' +
      n +
      ' slope rating"><button type="button" class="remove-btn" data-act="removeTee(' +
      i +
      ')" aria-label="Remove the ' +
      n +
      ' tees"><i data-ico="close"></i></button></div>';
  });
  h +=
    '<button type="button" class="btn small secondary tee-add" data-act="addTee()">+ Add tees</button>';
  el.innerHTML = h;
  "function" == typeof hydrateIcons && hydrateIcons(el);
  el.querySelectorAll(".te-name, .te-rating, .te-slope").forEach((inp) =>
    inp.addEventListener("change", onTeeInput),
  );
}
function onTeeInput(ev) {
  const inp = ev.target,
    i = +inp.dataset.i,
    t = editTees()[i];
  if (!t) return;
  const v = inp.value.trim();
  if (inp.classList.contains("te-name")) t.name = v;
  else if (inp.classList.contains("te-rating")) {
    const r = Math.round(10 * parseFloat(v)) / 10;
    if (v && !(r >= RATING_MIN && r <= RATING_MAX)) {
      showToast("Course rating is the 18-hole figure on the card, like 71.4.", { type: "error" });
      return void (inp.value = null != t.rating ? t.rating : "");
    }
    ((t.rating = v ? r : null), (inp.value = v ? r : ""));
  } else {
    const sl = Math.round(+v);
    if (v && !(sl >= SLOPE_MIN && sl <= SLOPE_MAX)) {
      showToast("Slope runs from " + SLOPE_MIN + " to " + SLOPE_MAX + " (113 is average).", {
        type: "error",
      });
      return void (inp.value = null != t.slope ? t.slope : "");
    }
    ((t.slope = v ? sl : null), (inp.value = v ? sl : ""));
  }
  i === _teeIdx && refreshSelectedTee();
  const box = document.getElementById("tee-options");
  box &&
    window._selectedCourse &&
    (box.innerHTML = teeOptionsHTML(window._selectedCourse, _teeIdx));
  inp.closest(".tee-edit-row") &&
    inp.closest(".tee-edit-row").classList.toggle("unusable", !teeUsable(t));
}
function addTee() {
  const list = editTees();
  if (list.length >= 12)
    return void showToast("That is every tee a course can have.", { type: "info" });
  list.push({ name: "", rating: null, slope: null });
  null == _teeIdx && (_teeIdx = list.length - 1);
  (renderTeeEditor(), refreshSelectedTee());
  const rows = document.querySelectorAll("#tee-editor .te-name");
  rows.length && rows[rows.length - 1].focus();
}
function removeTee(i) {
  const list = editTees();
  if (!list[i]) return;
  list.splice(i, 1);
  _teeIdx =
    null == _teeIdx
      ? null
      : i === _teeIdx
        ? list.length
          ? 0
          : null
        : i < _teeIdx
          ? _teeIdx - 1
          : _teeIdx;
  (renderTeeEditor(), refreshSelectedTee());
}
function playTee(i) {
  if (!editTees()[i]) return;
  ((_teeIdx = i), haptic(), renderTeeEditor(), refreshSelectedTee());
}
document.addEventListener("DOMContentLoaded", () => {
  const e = document.getElementById("course-search"),
    t = document.getElementById("course-results");
  (e.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const a = e.value.trim().toLowerCase();
    a.length < 2
      ? t.classList.add("hidden")
      : (searchTimeout = setTimeout(() => searchCourses(a), 150));
  }),
    e.addEventListener("focus", () => {
      e.value.trim().length >= 2 && searchCourses(e.value.trim().toLowerCase());
    }),
    e.addEventListener("keydown", (ev) => {
      const items = [...t.querySelectorAll(".course-item[data-act]")];
      if (!items.length || t.classList.contains("hidden")) return;
      let hi = items.findIndex((el) => el.classList.contains("kb-active"));
      if ("ArrowDown" === ev.key) (ev.preventDefault(), (hi = Math.min(items.length - 1, hi + 1)));
      else if ("ArrowUp" === ev.key) (ev.preventDefault(), (hi = hi <= 0 ? 0 : hi - 1));
      else {
        if ("Enter" === ev.key) return void (hi >= 0 && (ev.preventDefault(), items[hi].click()));
        if ("Escape" === ev.key) return void t.classList.add("hidden");
        return;
      }
      (items.forEach((el, k) => el.classList.toggle("kb-active", k === hi)),
        items[hi] && items[hi].scrollIntoView({ block: "nearest" }));
    }),
    document.addEventListener("click", (e) => {
      e.target.closest(".course-search-wrap") || t.classList.add("hidden");
    }));
});
document.addEventListener("DOMContentLoaded", () => {
  history.replaceState({ navKind: "base" }, "");
  let e = !1;
  const t = new MutationObserver(() => {
    const a = !!document.querySelector(".modal:not(.hidden)");
    a && !e
      ? ((e = !0), history.pushState({ navKind: "modal" }, ""), lockBodyScroll())
      : a || ((e = !1), unlockBodyScroll());
  });
  (document
    .querySelectorAll(".modal")
    .forEach((e) => t.observe(e, { attributes: !0, attributeFilter: ["class"] })),
    window.addEventListener("popstate", () => {
      const e = document.querySelector(".modal:not(.hidden)");
      if (e) return void closeModal(e.id);
      if (!document.getElementById("scoring-screen").classList.contains("hidden")) {
        const _leave = () => {
          (state.started && saveCurrentRound(), enterScreen("home", { noPush: !0 }));
        };
        if (isSpectator)
          return ("function" == typeof exitSpectator && exitSpectator(), void _leave());
        if (state.started)
          return void appConfirm("Return to home? Your round is auto-saved.", {
            title: "Leave Round",
            confirmLabel: "Go Home",
          }).then((ok) => {
            ok ? _leave() : history.pushState({ navKind: "scoring" }, "");
          });
        return void _leave();
      }
      enterScreen("home", { noPush: !0 });
    }));
});
