function showSettings(focus) {
  const e = document.getElementById("settings-content");
  ((e.innerHTML = `\n    <div class="settings-label">You</div><div class="settings-section">
      <div class="settings-row"><span>You’re playing as<small style="display:block;font-size:0.72rem;color:var(--muted);font-weight:500">${primaryPlayerIsGuess() ? "Guessed from your round history — pick yourself so every “your” total is really yours." : "Every “your” total in the app is read off this name."}</small></span><select id="settings-me" aria-label="Which player are you" data-change="setPrimaryPlayer(this.value)">${primaryPlayerOptionsHTML()}</select></div>
      ${myProfileName() ? `<div class="settings-row"><span>Your handicap<small class="my-hdcp-state" style="display:block;font-size:0.72rem;color:var(--muted);font-weight:500">${null == myHandicap() ? MY_HDCP_UNSET : MY_HDCP_SET}</small></span>${myHdcpFieldHTML("")}</div>` : ""}
    </div>
    <div class="settings-label">Round Defaults</div><div class="settings-section">\n      <div class="settings-row skin-row"><span>Skin <small style="display:block;font-size:0.72rem;color:var(--muted);font-weight:500">Clubhouse is the scorecard, Broadcast the odds board, Sunlight for when the screen is fighting the sun.</small></span><div class="skin-picker" role="radiogroup" aria-label="Skin">${SKINS.map((k) => `<button type="button" class="skin-opt${activeSkin() === k ? " active" : ""}" role="radio" aria-checked="${activeSkin() === k ? "true" : "false"}" data-act="pickSkin('${k}',this)"><span class="skin-swatch" data-skin="${k}" aria-hidden="true"></span><span class="skin-name">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="skin-desc">${SKIN_DESC[k]}</span></button>`).join("")}</div></div>\n      ${wakeLockSupported() ? `<div class="settings-row" data-act="toggleKeepAwake(this)" role="switch" tabindex="0" aria-checked="${keepAwakeEnabled() ? "true" : "false"}"><span>Keep Screen Awake <small style="display:block;font-size:0.72rem;color:var(--muted);font-weight:500">Holds the screen on while a round is open, so you are not unlocking the phone on every tee.</small></span><span class="ui-switch${keepAwakeEnabled() ? " on" : ""}" aria-hidden="true"><span class="ui-switch-knob"></span></span></div>` : ""}\n      <div class="settings-row"><span>Default Game</span><select id="settings-game" data-change="saveDefaultGame(this.value)">${["none", "wolf", "nassau", "skins", "match", "stableford", "bingo", "dots", "vegas", "snake", "sixes", "banker"].map((e) => '<option value="' + e + '"' + (localStorage.getItem("defaultGame") === e || (!localStorage.getItem("defaultGame") && "wolf" === e) ? " selected" : "") + ">" + (GAME_NAMES[e] || e) + "</option>").join("")}</select></div>\n      <div class="settings-row"><span>Default Holes</span><div class="hole-toggle settings-holes-toggle" role="group" aria-label="Default holes"><button class="hole-toggle-btn ${"18" === localStorage.getItem("defaultHoles") ? "" : "active"}" data-act="pickDefaultHoles('9',this)">9</button><button class="hole-toggle-btn ${"18" === localStorage.getItem("defaultHoles") ? "active" : ""}" data-act="pickDefaultHoles('18',this)">18</button></div></div>\n    </div>\n    <div class="settings-label">Legal</div><div class="settings-section">\n      <div class="settings-row" data-act="showLegal('privacy')" role="button" tabindex="0"><span>Privacy Policy</span><span><i data-ico="right"></i></span></div>\n      <div class="settings-row" data-act="showLegal('terms')" role="button" tabindex="0"><span>Terms of Service</span><span><i data-ico="right"></i></span></div>\n    </div>\n    <div class="settings-label">Help &amp; Data</div><div class="settings-section">\n      <div class="settings-row" data-act="showGuide()" role="button" tabindex="0"><span>How to Play &amp; Features</span><span><i data-ico="right"></i></span></div>\n      <div class="settings-row" data-act="showOnboarding()" role="button" tabindex="0"><span>Quick Tour</span><span><i data-ico="right"></i></span></div>\n      <div class="settings-row" data-act="exportAllData()" role="button" tabindex="0"><span>Export Data</span><span><i data-ico="right"></i></span></div>\n      <div class="settings-row" data-act="openImportPicker()" role="button" tabindex="0"><span>Import Data</span><span><i data-ico="right"></i></span></div><input type="file" id="import-file-input" accept="application/json" class="hidden" data-change="handleImportFile(event)">\n    </div>\n    ${
      window.__PRESS_DEMO__
        ? `<div class="settings-label">Demo</div><div class="settings-section">
      <div class="settings-row" data-act="loadDemoSeason()" role="button" tabindex="0"><span>Load demo season</span><span><i data-ico="right"></i></span></div>
      <div class="settings-row" data-act="clearDemoData()" role="button" tabindex="0"><span>Clear demo data</span><span><i data-ico="right"></i></span></div>
    </div>`
        : ""
    }
    <div class="settings-label" style="color:var(--red)">Danger Zone</div><div class="settings-section danger">\n      <div class="settings-row" data-act="deleteAccount()" role="button" tabindex="0"><span>Delete Account & Data</span><span><i data-ico="right"></i></span></div>\n    </div>\n    <div class="settings-version">The Press v1.0.0</div>\n  `),
    document.getElementById("settings-modal").classList.remove("hidden"),
    openModalA11y("settings-modal"));
  if ("skin" === focus) {
    const r = e.querySelector('.skin-picker [aria-checked="true"]'),
      mc = e.closest(".modal-content");
    if (r && mc) {
      /* Scroll the popup, never the page: iOS scrolls outer boxes on scrollIntoView and on focus, which pushed the popup's top off screen. */ const rb =
          r.getBoundingClientRect(),
        cb = mc.getBoundingClientRect();
      (rb.bottom > cb.bottom && (mc.scrollTop += rb.bottom - cb.bottom + 16),
        r.focus({ preventScroll: !0 }));
    }
  }
}
function saveDefaultGame(e) {
  safeSetItem("defaultGame", e);
}
function saveDefaultHoles(e) {
  safeSetItem("defaultHoles", e);
} /* Deleting an account used to be three unawaited calls behind a success toast.
   localStorage.clear() ran first -- which is where the Firebase SDK keeps the
   session the delete needs -- and both cloud deletes returned promises that the
   surrounding try/catch could never catch, so a rejection was invisible. The
   common rejection is auth/requires-recent-login, which Firebase raises on any
   session more than a few minutes old: the everyday case was the app saying
   "Account deleted" while the account and its rounds were still there.

   So: erase the cloud first, while the credentials still exist, await every
   step, re-authenticate when Firebase asks, and only wipe the device and claim
   success once the server has actually confirmed. If it fails, say so. */
async function deleteOwnedLiveRounds(uid) {
  // Rounds this player hosted outlive the round itself and carry the whole
  // group's names and scores, so they have to go too. The rules allow exactly
  // this query and no wider one.
  const snap = await db.collection("liveRounds").where("owner", "==", uid).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function deleteCloudAccount() {
  const uid = currentUser.uid;
  await deleteOwnedLiveRounds(uid);
  await db.collection("users").doc(uid).delete();
  try {
    await auth.currentUser.delete();
  } catch (err) {
    if (err && "auth/requires-recent-login" === err.code) {
      // Firebase will not delete a stale session's account. Ask for the sign-in
      // again rather than reporting a deletion that did not happen.
      await auth.currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
      await auth.currentUser.delete();
    } else {
      throw err;
    }
  }
}
async function deleteAccount() {
  if (
    !(await appConfirm("Delete all your data? This cannot be undone.", {
      title: "Delete All Data",
      confirmLabel: "Continue",
      danger: !0,
    }))
  )
    return;
  if (
    !(await appConfirm(
      "Are you sure? All rounds, profiles, and courses will be permanently deleted.",
      { title: "Last Chance", confirmLabel: "Delete Everything", danger: !0 },
    ))
  )
    return;
  const signedIn =
    "undefined" != typeof db && db && "undefined" != typeof currentUser && currentUser;
  if (signedIn) {
    showToast("Deleting your data…", { type: "info" });
    try {
      await deleteCloudAccount();
    } catch (err) {
      console.error("Account deletion failed:", err);
      const why =
        err && "auth/popup-closed-by-user" === err.code
          ? "Sign-in was cancelled, so nothing was deleted."
          : "Your data could not be deleted. Nothing was removed — please try again.";
      showToast(why, { type: "error", persistent: !0 });
      return;
    }
  }
  // Only now, with the server confirmed clear, wipe the device.
  localStorage.clear();
  (showToast("Account deleted. The app will now reload.", { type: "success", persistent: !0 }),
    setTimeout(() => location.reload(), 1200));
}
function showGuide() {
  document.getElementById("legal-content").innerHTML =
    `<div class="guide"><h2>How to Play &amp; Use</h2>
<h3>Start a round</h3><p>Pick a course from the list (the built-in library covers popular U.S. courses) or type any course name and enter its pars manually. Add players from your saved database or as you go, choose a game and set the stakes, then tap <strong>Start Round</strong>.</p>
<h3>Enter scores</h3><p>Tap a player's row or their number to open the score pad — it jumps to the next unscored player automatically, so a foursome is one tap each. You can also use the − / + steppers. Untouched rows show a faded par as a placeholder. Tap <strong>Confirm</strong> to lock the hole and see the result; swipe or use the arrows to move between holes.</p>
<h3>Handicaps</h3><p>Enter each player's index and strokes are applied automatically, taken off the low player. In setup choose <strong>Full</strong>, <strong>Course</strong> (uses the tee's slope and rating), or <strong>None</strong> for scratch.</p>
<h3>The games</h3>
<p class="g-game"><strong>Wolf Hammer</strong> — a rotating "wolf" each hole picks a partner, plays Lone Wolf (2×), Blind, or Shuck (1 vs everyone). Either side can <strong>Hammer</strong> to double the stakes; the other side accepts or hammers back.</p>
<p class="g-game"><strong>Nassau</strong> — three match bets: front 9, back 9, and overall. Optional auto-presses and 2-vs-2 teams.</p>
<p class="g-game"><strong>Skins</strong> — low net wins the hole's pot; tied holes can carry over to the next.</p>
<p class="g-game"><strong>Match Play</strong> — each hole worth a set amount, or front/back/overall segments.</p>
<p class="g-game"><strong>Stableford</strong> — points scored against par, settled on the difference; optional quota.</p>
<p class="g-game"><strong>Bingo Bango Bongo</strong> — a point each for first on the green, closest once all are on, and first in the hole.</p>
<p class="g-game"><strong>Trash / Dots</strong> — side bets: greenies, sandies, barkies, birdies and more, tapped in per hole.</p>
<p class="g-game"><strong>Vegas</strong> — two teams combine their scores into a number; the low team wins the difference.</p>
<p class="g-game"><strong>Snake</strong> — whoever three-putts most recently holds the snake and pays the pot at the end.</p>
<p class="g-game"><strong>Sixes</strong> — partners rotate every six holes across three mini-matches.</p>
<h3>Wolf picks, presses &amp; junk</h3><p>During a hole the on-screen buttons set the wolf's pick, add a hammer, concede the hole for a team, or award dots and points. Conceding gives the hole to the other team at the current stakes — handy when a team picks up. Tap an awarded dot again to remove just that one. For a press in Match or Nassau, tap <strong>Press</strong> and pick the player from the list — no typing.</p>
<h3>Play live with friends</h3><p>On the scoring screen tap <strong>Share</strong> to broadcast the round (needs a Google sign-in). Friends enter the 6-character code to score together, or open the watch link to follow along read-only. Join someone else's round from the <strong>Live</strong> tab.</p>
<h3>Settle up</h3><p>Finish the round to see the champion, the fewest payments needed to square everyone, and one-tap Venmo links. Add a player's Venmo handle (tap the pencil on their setup row) to enable payout links for them.</p>
<h3>History &amp; stats</h3><p>Every finished round is saved with the winner and amount. Season stats track money won and scoring versus par across all your rounds.</p>
<h3>Fixing mistakes</h3><p><strong>Undo</strong> reverts your last change, and you can re-open a locked hole to edit it. All scoring saves automatically as you go.</p></div>`;
  (document.getElementById("legal-modal").classList.remove("hidden"), openModalA11y("legal-modal"));
} /* The full, canonical policies live at privacy.html and terms.html, served from
   the site root so they have real URLs -- a policy that exists only inside a
   modal cannot be linked from an app store listing, a sign-in screen, or an
   email. What follows is the in-app summary of the same text, and it links out
   rather than trying to be a second copy of record. */
const LEGAL_SUMMARY = {
  privacy:
    "<h2>Privacy Policy</h2>" +
    "<p><strong>If you never sign in, nothing you enter leaves your phone.</strong> Scores, players, handicaps, courses and money all live in this device's storage.</p>" +
    "<h3>Signing in with Google</h3><p>Optional. It syncs your rounds across devices and unlocks live rounds and the shared course library. We receive your Google name, email, account ID and photo — never your password.</p>" +
    "<h3>What syncs</h3><ul><li>Saved player profiles (names, handicaps)</li><li>Saved courses</li><li>Round history — scores, stakes and results</li></ul>" +
    "<h3>Live rounds</h3><p>A shared round — course, player names, scores and running money — is stored on our server under its six-character code. <strong>Anyone holding that code can read it</strong>, and a watch link works without signing in. Nobody can search or browse for rounds. Treat the code like a link to a shared document.</p>" +
    "<h3>Shared courses</h3><p>Courses you save are published to a library all players use. Course data only — no names, no scores, not attributed to you. Library entries stay when you delete your account.</p>" +
    "<h3>Money</h3><p>We never handle it. Settle-up buttons open Venmo, Cash App or PayPal with the amount filled in; the payment happens there, between you and the other player.</p>" +
    "<h3>What we don't do</h3><p>No ads, no analytics or tracking, no selling data. Ever.</p>" +
    "<h3>Your data</h3><p>Settings → <strong>Export Data</strong> downloads everything we hold about you. Settings → <strong>Delete Account &amp; Data</strong> erases your synced record, the live rounds you host and your sign-in — permanently, and it tells you if any part fails.</p>" +
    '<p><a href="privacy.html" target="_blank" rel="noopener">Read the full Privacy Policy →</a></p>',
  terms:
    "<h2>Terms of Service</h2>" +
    "<p>By using <strong>The Press</strong> you agree to these terms.</p>" +
    "<h3>What this is</h3><p>A scorekeeper and a calculator. It records scores, applies handicap strokes, works out the game you picked at the stakes you set, and shows who owes whom.</p>" +
    "<h3>What this is not</h3><p><strong>The Press is not a gambling service or a payment service.</strong> It never accepts, holds or transfers money, takes no fee or share of any wager, offers no wager and sets no odds. Every bet is a private arrangement between you and the people you play with.</p>" +
    "<h3>Your side</h3><ul><li>Be 18 or older to track a wager, and know the law where you play — rules on social wagering differ by state and country.</li><li>Settle with your group. We offer no dispute resolution and no guarantee that anyone pays.</li><li>What you enter — scores, handicaps, stakes, tee data — is yours to get right.</li></ul>" +
    "<h3>Share codes</h3><p>Anyone with a round's code can read it, and any signed-in holder can enter scores. You choose who gets it.</p>" +
    "<h3>Course data</h3><p>Built-in ratings, slopes and stroke indexes are best-effort values from published scorecards and can be wrong. Check them against the card — a wrong slope changes the strokes, and the strokes change the money.</p>" +
    '<h3>No warranty</h3><p>The app is provided "as is." We are not liable for any lost wager, miscalculated settlement, unpaid debt or dispute between players.</p>' +
    '<p><a href="terms.html" target="_blank" rel="noopener">Read the full Terms of Service →</a></p>',
};
function showLegal(e) {
  document.getElementById("legal-content").innerHTML =
    LEGAL_SUMMARY["privacy" === e ? "privacy" : "terms"];
  (document.getElementById("legal-modal").classList.remove("hidden"), openModalA11y("legal-modal"));
}
const GAME_NAMES = {
  none: "None (Score Only)",
  wolf: "Wolf Hammer",
  nassau: "Nassau",
  skins: "Skins",
  match: "Match Play",
  stableford: "Stableford",
  bingo: "Bingo Bango Bongo",
  dots: "Trash / Dots",
  vegas: "Vegas",
  snake: "Snake",
  sixes: "Sixes",
  banker: "Banker",
};
const ONBOARDING_SCREENS = [
  {
    icon: '<svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4l10 3-10 3"/><ellipse cx="12" cy="21" rx="7" ry="1.6"/></svg>',
    title: "Track Your Round",
    desc: "Enter scores hole by hole. Handicap strokes are calculated automatically off the low man.",
  },
  {
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/></svg>',
    title: "Pick Your Game",
    desc: "Wolf Hammer, Nassau, Skins, Match Play, Vegas, and more. Set your bet amounts and team format.",
  },
  {
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M16.5 7c0-1.6-2-2.4-4.5-2.4S7.5 5.6 7.5 7.4s2 2.4 4.5 2.8 4.5 1.2 4.5 2.9-2 2.9-4.5 2.9-4.5-.9-4.5-2.5"/></svg>',
    title: "Settle Up",
    desc: "Real-time money tracking. At the end, see exactly who owes whom with minimum transactions.",
  },
];
let _onboardingStep = 0;
function showOnboarding() {
  ((_onboardingStep = 0),
    renderOnboardingStep(),
    document.getElementById("onboarding-modal").classList.remove("hidden"),
    openModalA11y("onboarding-modal"));
}
function renderOnboardingStep() {
  const e = ONBOARDING_SCREENS[_onboardingStep],
    t = _onboardingStep === ONBOARDING_SCREENS.length - 1;
  document.getElementById("onboarding-content").innerHTML =
    `\n    <div class="onboard-icon">${e.icon}</div>\n    <h2 class="onboard-title">${e.title}</h2>\n    <p class="onboard-desc">${e.desc}</p>\n    <div class="onboard-dots">${ONBOARDING_SCREENS.map((e, t) => '<span class="onboard-dot' + (t === _onboardingStep ? " active" : "") + '" data-act="goToOnboardingStep(' + t + ')"></span>').join("")}</div>\n    <button class="btn primary large" data-act="${t ? "skipOnboarding()" : "nextOnboarding()"}">${t ? "Get Started" : "Next"}</button>\n    ${t ? "" : '<div class="onboard-skip" data-act="skipOnboarding()" role="button" tabindex="0">Skip</div>'}\n  `;
}
function skipOnboarding() {
  (closeModal("onboarding-modal"), safeSetItem("onboarded", "1"));
}
function goToOnboardingStep(e) {
  ((_onboardingStep = e), renderOnboardingStep());
}
function nextOnboarding() {
  (_onboardingStep++, renderOnboardingStep());
}
function checkOnboarding() {
  localStorage.getItem("onboarded") || showOnboarding();
}
