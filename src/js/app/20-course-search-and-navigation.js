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
      tees: [],
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
        '<div class="course-item loading">No matches in the built-in list — enter your course manually below.</div>'),
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
  ((window._selectedCourse = t),
    (document.getElementById("course-name").value = t.name),
    (document.getElementById("course-search").value = ""),
    document.getElementById("course-results").classList.add("hidden"));
  const a = t.pars.reduce((e, t) => e + t, 0),
    s = document.getElementById("selected-course");
  (s.classList.remove("hidden"),
    (s.innerHTML = `<div class="selected-course-info">\n    <div class="selected-course-name">${esc(t.name)}</div>\n    <div class="selected-course-loc">${esc(t.city)}, ${esc(t.state)} · Par ${a}</div>\n  </div>\n  <div class="tee-selector">\n    <label id="tee-select-label">Select Tees</label>\n    <div class="tee-options" id="tee-options" role="group" aria-labelledby="tee-select-label">\n      ${t.tees.map((e, t) => `\n        <div class="tee-option ${0 === t ? "active" : ""}" data-act="selectTee(${t})" data-tee="${t}" role="button" tabindex="0">\n          <div class="tee-color-bar" style="background:${teeColor(e.name)}"></div>\n          <div class="tee-details">\n            <div class="tee-name">${esc(e.name)}</div>\n            <div class="tee-stats">${e.yds.toLocaleString()} yds · ${e.rating}/${e.slope}</div>\n          </div>\n        </div>\n      `).join("")}\n    </div>\n  </div>\n  <button class="btn small secondary" data-act="clearCourse()" style="margin-top:8px;width:100%"><i data-ico="close"></i> Clear Selection</button>\n  <div class="verify-note">Verify yardage & ratings against your scorecard. Pars & handicaps are editable below.</div>`),
    applyCoursePars(),
    buildParGrid(),
    setParDetailCollapsed(!0));
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
    (state.selectedTee = t.tees[e] ? { ...t.tees[e] } : null),
    applyCoursePars(),
    buildParGrid(),
    setParDetailCollapsed(!0));
}
function clearCourse() {
  (document.getElementById("selected-course").classList.add("hidden"),
    (document.getElementById("course-name").value = ""),
    (state.pars = [...STANDARD_PARS]),
    (state.hdcps = [...STANDARD_HDCP]),
    (state.selectedTee = null),
    invalidateHdcpCache(),
    buildParGrid(),
    setParDetailCollapsed(!1));
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
