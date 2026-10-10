/* Notice a deploy without a relaunch.

   The worker serves the cached shell first and revalidates it in the
   background, but only on a navigation -- a launch or a reload. A phone that
   keeps the app open, or an installed app resumed from the background, never
   navigates, so it can run last week's build indefinitely: a change ships and
   the person holding the phone never sees it. And during a round the screen
   is held awake for four hours, so the app is never even hidden.

   Fetching the shell from the page goes through the same revalidate in
   sw.js, which compares it with the cached copy and posts "shell-updated" when
   they differ; the existing prompt then offers the reload. So: check on the
   way back to the foreground, and every half hour while the app stays up.
   No network, no worker in control, or checked recently -- do nothing. */
const SHELL_CHECK_MS = 30 * 60 * 1000;
let _lastShellCheck = Date.now();
function checkForShellUpdate() {
  if (
    !("serviceWorker" in navigator) ||
    !navigator.serviceWorker.controller ||
    !navigator.onLine ||
    Date.now() - _lastShellCheck < SHELL_CHECK_MS
  )
    return;
  _lastShellCheck = Date.now();
  fetch(location.pathname, { cache: "no-cache", credentials: "same-origin" }).catch(() => {});
}
document.addEventListener("visibilitychange", () => {
  "visible" === document.visibilityState && checkForShellUpdate();
});
setInterval(() => {
  "visible" === document.visibilityState && checkForShellUpdate();
}, SHELL_CHECK_MS);
