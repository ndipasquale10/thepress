# Architecture

The Press is a single-file, offline-first PWA. The phone is the source of truth;
Firebase is an optional mirror that adds sync, live rounds, and a shared course
library. The diagrams below render on GitHub.

## System overview

```mermaid
flowchart LR
  subgraph Device["Player's phone"]
    direction TB
    UI["index.html<br/>markup · styles · logic<br/>COURSE_DB inlined"]
    SW["sw.js<br/>service worker"]
    Cache[("Cache Storage<br/>app shell · logos · html2canvas")]
    LS[("localStorage<br/>golfProfiles · golfCourses<br/>golfRounds · golfRoundActive")]
    UI <-->|"read / write every change"| LS
    SW <--> Cache
    UI -. "fetch" .-> SW
  end

  subgraph Google["Firebase — optional, loaded on idle by ensureFirebase()"]
    direction TB
    CDN["gstatic.com<br/>Firebase SDK 10.12 compat"]
    Auth["Firebase Auth<br/>Google Sign-In"]
    subgraph FS["Cloud Firestore — guarded by firestore.rules"]
      Users[("users/{uid}<br/>private mirror")]
      Live[("liveRounds/{code}<br/>round in progress")]
      Shared[("sharedCourses/{slug}<br/>community library")]
    end
  end

  Pay["Venmo · Cash App · PayPal<br/>deep links, amount pre-filled"]
  OS["OS share sheet<br/>image / text recap"]

  UI -. "SDK on idle" .-> CDN
  UI -->|"signInWithPopup"| Auth
  UI -->|"syncProfiles / Courses / Rounds"| Users
  UI <-->|"shareRoundLive · joinLiveRound<br/>onSnapshot"| Live
  UI <-->|"loadSharedCourses · saveCourse"| Shared
  UI -->|"settle up"| Pay
  UI -->|"shareScorecard · shareResults"| OS
```

Key properties:

- **Nothing on the launch path touches the network.** The SDK is fetched after
  the first screen is up, so the scorecard opens in a dead zone.
- **Firestore mirrors, never owns.** A signed-out player loses nothing;
  `syncFromFirestore()` merges the cloud copy back into `localStorage`.
- **Money never moves through the app.** Settlement hands off to payment apps.

## Inside `index.html`

```mermaid
flowchart TB
  Setup["Round setup<br/>course · players · handicaps · game · side bets"]
  Score["Scoring screen<br/>hole-by-hole entry, undo stack"]
  Engine["Money engine<br/>calcMoney → calcWolfMoney · calcNassauMoney · calcSkinsMoney<br/>calcMatchMoney · calcStablefordMoney · calcVegasMoney · calcSnakeMoney<br/>calcSixesMoney · calcBankerMoney · calcBonusMoney"]
  Totals["computeHoleMoney · computeRunningTotals"]
  Settle["computeSettlement<br/>fewest transactions"]
  History["History & stats<br/>computeScoringStats · computeHandicapIndex"]
  LS[("localStorage")]
  Live[("liveRounds/{code}")]

  Setup --> Score
  Score -->|"every score"| Engine --> Totals --> Score
  Score -->|"saveCurrentRound"| LS
  Score <-->|"if live"| Live
  Score -->|"finish 18"| Settle
  Settle -->|"saveFinishedRound"| LS
  LS --> History
```

## Live rounds

The six-character share code *is* the document ID, so a round can be fetched by
its code but the collection can't be listed.

```mermaid
sequenceDiagram
  participant Host as Host phone
  participant FS as Firestore liveRounds/{code}
  participant Guest as Guest phone
  participant Watcher as ?watch= link

  Host->>FS: shareRoundLive() — create doc, owner = uid
  Host-->>Guest: share code
  Guest->>FS: joinLiveRound(code)
  FS-->>Guest: round snapshot
  loop each hole
    Host->>FS: scores, presses, Breakouts
    Guest->>FS: scores
    FS-->>Host: onSnapshot
    FS-->>Guest: onSnapshot
    FS-->>Watcher: onSnapshot, read-only
  end
```

## Build, test, and deploy

```mermaid
flowchart LR
  Data["data/courses.json"] -->|"npm run build:courses"| HTML["index.html<br/>COURSE_DB block"]
  Rules["firestore.rules"]

  subgraph CI["GitHub Actions"]
    direction TB
    T1["npm test<br/>money math · Wolf/Hammer · course sync check · UI audit"]
    T2["test:flows<br/>Playwright, Firebase stubbed out"]
    T3["test:rules<br/>Firestore emulator"]
    T4["test:live<br/>two browsers vs Auth + Firestore emulators"]
    Deploy["deploy-rules.yml<br/>push to main"]
  end

  HTML --> T1 & T2 & T4
  Data --> T1
  Rules --> T3 & T4
  Rules --> Deploy -->|"firebase deploy --only firestore:rules"| Prod[("Production Firestore")]
```

`scripts/build-preview.py` produces the two builds the browser tests drive by
rewriting the `FIREBASE_SDK` array: emptied for `flows.mjs`, repointed at
`node_modules` for `live-round.test.mjs`.
