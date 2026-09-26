var db,
  auth,
  _fbLoad = null;
// scripts/build-preview.py rewrites this line, so it stays one line.
// prettier-ignore
var FIREBASE_SDK=["https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js","https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js","https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"];
function _fbScript(src) {
  return new Promise(function (ok, no) {
    var s = document.createElement("script");
    /* async=false on an injected script keeps execution order: firestore-compat
     expects app-compat to have run. */
    ((s.async = !1),
      (s.src = src),
      (s.onload = ok),
      (s.onerror = function () {
        no(new Error("could not load " + src));
      }),
      document.head.appendChild(s));
  });
}
function ensureFirebase() {
  if (_fbLoad) return _fbLoad;
  if (!FIREBASE_SDK.length) return (_fbLoad = Promise.resolve(!1));
  return (_fbLoad = FIREBASE_SDK.reduce(function (p, src) {
    return p.then(function () {
      return _fbScript(src);
    });
  }, Promise.resolve())
    .then(function () {
      firebase.apps.length ||
        firebase.initializeApp({
          apiKey: "AIzaSyCluj8g-VsVI1fHQCajID8z-lMBQGxe8Cg",
          authDomain: "greenside-c86cf.firebaseapp.com",
          projectId: "greenside-c86cf",
          storageBucket: "greenside-c86cf.firebasestorage.app",
          messagingSenderId: "748663106763",
          appId: "1:748663106763:web:bfd77b8e885ccfb19f3f4e",
        });
      ((db = firebase.firestore()), (auth = firebase.auth()));
      /* The emulator build defines this to redirect both handles before anything
       reads them. Production leaves it undefined. */
      if ("function" == typeof window.__FB_AFTER_INIT__) window.__FB_AFTER_INIT__();
      if ("function" == typeof bindFirebaseAuth) bindFirebaseAuth();
      return !0;
    })
    .catch(function (e) {
      /* Clear the handle so the next tap can try again -- the usual reason to be
       here is a car park with no signal, and the next attempt is on the tee. */
      (console.warn("Firebase unavailable - continuing offline:", e.message), (_fbLoad = null));
      return !1;
    }));
}
