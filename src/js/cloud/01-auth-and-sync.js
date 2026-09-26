let currentUser = null;
async function signInWithGoogle(e) {
  const t = e && e.innerHTML;
  /* The SDK now arrives on idle, so a tap a second after launch can land
     before it. Show the spinner, wait for the load, and only then decide
     there is no sign-in to be had. */
  e && ((e.disabled = !0), (e.innerHTML = '<span class="spinner"></span>Signing in…'));
  await ensureFirebase();
  if (!auth) {
    e && ((e.disabled = !1), (e.innerHTML = t));
    return void showToast("Sign-in unavailable offline. You can still use the app locally.", {
      type: "error",
    });
  }
  const a = new firebase.auth.GoogleAuthProvider();
  auth
    .signInWithPopup(a)
    .catch((e) => {
      (console.error("Sign-in error:", e),
        showToast("Sign-in failed: " + (e.message || e.code || "Unknown error"), {
          type: "error",
          persistent: !0,
        }));
    })
    .finally(() => {
      e && ((e.disabled = !1), (e.innerHTML = t));
    });
}
function signOutUser() {
  auth && auth.signOut();
}
function userDoc() {
  return currentUser ? db.collection("users").doc(currentUser.uid) : null;
}
async function syncProfilesToFirestore() {
  const e = userDoc();
  if (!e) return;
  const t = getSavedProfiles();
  await e.set({ profiles: t }, { merge: !0 });
}
async function syncCoursesToFirestore() {
  const e = userDoc();
  if (!e) return;
  const t = getSavedCourses();
  await e.set({ courses: t }, { merge: !0 });
  for (const e of t) {
    const t = e.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    await db.collection("sharedCourses").doc(t).set(e, { merge: !0 });
  }
}
async function loadSharedCourses() {
  try {
    const e = await db.collection("sharedCourses").get(),
      t = [];
    if ((e.forEach((e) => t.push(e.data())), !t.length)) return;
    const s = getSavedCourses(),
      n = mergeByName(
        s,
        t.map((e) => ({ ...e, saved: !0 })),
      ),
      o = n.length - s.length;
    o > 0 &&
      (safeSetItem("golfCourses", JSON.stringify(n)),
      console.log("Loaded " + o + " shared courses"));
  } catch (e) {
    console.warn("Could not load shared courses:", e.message);
  }
}
async function syncRoundsToFirestore() {
  if (!canMutateRound()) return;
  const e = userDoc();
  if (!e) return;
  const t = readRounds(),
    d = readDeletedRounds(),
    r = { ...t };
  /* A merge write only adds and updates, so a deleted round has to be removed
     from the cloud copy by name. */
  for (const id in d) t[id] || (r[id] = firebase.firestore.FieldValue.delete());
  await e.set({ rounds: r, deletedRounds: d }, { merge: !0 });
}
async function syncFromFirestore() {
  const e = userDoc();
  if (e)
    try {
      const t = await e.get();
      if (!t.exists)
        return (
          safeFirebaseSync(syncProfilesToFirestore),
          safeFirebaseSync(syncCoursesToFirestore),
          void safeFirebaseSync(syncRoundsToFirestore)
        );
      const s = t.data();
      if (s.profiles) {
        const t = mergeByName(s.profiles, getSavedProfiles());
        safeSetItem("golfProfiles", JSON.stringify(t));
      }
      if (s.courses) {
        const t = mergeByName(s.courses, getSavedCourses());
        safeSetItem("golfCourses", JSON.stringify(t));
      }
      if (s.rounds || s.deletedRounds) {
        const m = mergeRoundSets(
          readRounds(),
          readDeletedRounds(),
          s.rounds || {},
          s.deletedRounds || {},
        );
        (safeSetItem("golfRounds", JSON.stringify(m.rounds)),
          safeSetItem(DELETED_KEY, JSON.stringify(m.deleted)),
          safeFirebaseSync(syncRoundsToFirestore));
      }
      ("function" == typeof renderPlayers && renderPlayers(),
        "function" == typeof updateNavCounts && updateNavCounts(),
        "function" == typeof renderResumeCard && renderResumeCard(),
        console.log("Synced from Firestore"));
    } catch (e) {
      console.error("Firestore sync error:", e);
    }
}
function safeFirebaseSync(e) {
  try {
    "undefined" != typeof db && currentUser && e();
  } catch (e) {
    console.warn("Firebase sync skipped:", e.message);
  }
} /* Who the auth bar shows, drawn before the SDK has loaded and said so. Waiting
   for the real answer meant a signed-in player watched "Sign in to sync your
   rounds across devices" for the first second of every launch. The session
   itself is real and persists in the SDK's own storage -- this only remembers
   the two strings needed to draw it -- and the live callback below overwrites
   whatever this guessed the moment it fires. Offline, where that callback never
   comes, this is also the honest answer: signed in, and the offline chip is
   already saying why nothing is syncing. */
function drawAuthBar(u) {
  const out = document.getElementById("auth-signed-out"),
    inn = document.getElementById("auth-signed-in");
  if (!out || !inn) return;
  (out.classList.toggle("hidden", !!u), inn.classList.toggle("hidden", !u));
  if (u) {
    const a = document.getElementById("auth-avatar"),
      n = document.getElementById("auth-name");
    (a && (a.src = u.photo || ""), n && (n.textContent = u.name || ""));
  }
}
function applyCachedAuth() {
  const u = safeParseJSON(localStorage.getItem("authUser"), null);
  u && drawAuthBar(u);
}
/* Called by ensureFirebase() once the SDK is actually present. It used to be
   a bare top-level statement, which only worked because the SDK was loaded by
   a blocking script above it. */
function bindFirebaseAuth() {
  auth &&
    auth.onAuthStateChanged((e) => {
      currentUser = e;
      if (e && _retryWatchCode && !isSpectator) {
        const t = _retryWatchCode;
        ((_retryWatchCode = null), startSpectator(t));
      }
      if (e) {
        (safeSetItem(
          "authUser",
          JSON.stringify({ name: e.displayName || e.email || "", photo: e.photoURL || "" }),
        ),
          drawAuthBar({ name: e.displayName || e.email, photo: e.photoURL }),
          syncFromFirestore()
            .then(() => showToast("Synced", { type: "success" }))
            .catch(() => {}),
          loadSharedCourses(),
          requestNotificationPermission());
      } else {
        try {
          localStorage.removeItem("authUser");
        } catch (_) {}
        drawAuthBar(null);
      }
    });
}
if ("function" == typeof saveProfiles) {
  const e = saveProfiles;
  window.saveProfiles = function () {
    (e(), safeFirebaseSync(syncProfilesToFirestore));
  };
}
if ("function" == typeof saveMyProfile) {
  const e = saveMyProfile;
  let t = null;
  window.saveMyProfile = function (p) {
    const r = e(p);
    return (
      r &&
        (clearTimeout(t), (t = setTimeout(() => safeFirebaseSync(syncProfilesToFirestore), 1500))),
      r
    );
  };
} /* The Firestore sync wrappers. These were installed by six 100 ms pollers waiting for functions that are hoisted and defined in this same script, so for the first tick after load the app ran unwrapped. They are direct now; the _patched flag stays as the signal that the wrapper is in place. */
{
  const e = saveCurrentRound;
  ((window.saveCurrentRound = function () {
    if (!canMutateRound()) return;
    (e(),
      safeFirebaseSync(() => {
        (pushLiveProgress(),
          clearTimeout(window._roundSyncTimer),
          (window._roundSyncTimer = setTimeout(
            () => safeFirebaseSync(syncRoundsToFirestore),
            3e3,
          )));
      }));
  }),
    (window.saveCurrentRound._patched = !0));
}
{
  const e = saveCourse;
  ((window.saveCourse = function () {
    (e(), safeFirebaseSync(syncCoursesToFirestore));
  }),
    (window.saveCourse._patched = !0));
}
{
  const e = saveEditedProfiles;
  ((window.saveEditedProfiles = function () {
    (e(), safeFirebaseSync(syncProfilesToFirestore));
  }),
    (window.saveEditedProfiles._patched = !0));
}
{
  const e = addNewProfile;
  ((window.addNewProfile = function () {
    (e(), safeFirebaseSync(syncProfilesToFirestore));
  }),
    (window.addNewProfile._patched = !0));
}
{
  const e = deleteProfile;
  ((window.deleteProfile = function (t) {
    (e(t), safeFirebaseSync(syncProfilesToFirestore));
  }),
    (window.deleteProfile._patched = !0));
}
{
  const e = saveFinishedRound;
  ((window.saveFinishedRound = function (t, s) {
    (e(t, s), safeFirebaseSync(syncRoundsToFirestore));
  }),
    (window.saveFinishedRound._patched = !0));
}
{
  const e = deleteRound;
  ((window.deleteRound = async function (t) {
    (await e(t), safeFirebaseSync(syncRoundsToFirestore));
  }),
    (window.deleteRound._patched = !0));
}
