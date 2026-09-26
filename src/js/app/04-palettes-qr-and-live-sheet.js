// surface, so a player keeps their identity while staying legible on paper and
// on black. Every entry clears 4.5:1 against its skin's --card and 3:1 against
// its --bg, and carries ink (chosen by inkOn) at 4.5:1 or better.
//
// What they do NOT do is stay apart under colour blindness, and an earlier
// version of this comment claimed they did. Measured with a Brettel/Vienot
// dichromat simulation and CIE76, the worst pair of the eight:
//
//                     normal   protan   deutan   tritan
//   clubhouse           31.7      4.8      1.9      2.0
//   broadcast (was)     24.8      5.6      1.1      3.5
//   broadcast (now)     29.9     15.7     10.3     18.5
//
// Broadcast was re-stepped because it cost nothing: every slot keeps its hue
// (max drift 9 degrees), normal-vision separation went UP, and the old set's
// worst --card contrast of 3.42:1 came up to 4.57:1 at the same time.
//
// Clubhouse is left alone deliberately. Pulling its deutan figure up to ~8.5
// is possible but drops normal-vision separation from 31.7 to 23.5, and that
// is a trade for a person to make, not a script. Eight categorical colours
// simply cannot all stay apart for a dichromat while each also clears 4.5:1 on
// both a near-white and a near-black surface -- five separate optimiser runs
// all bought separation with lightness extremes that do not belong here.
//
// So colour is never the only carrier of identity: avatarHTML stamps initials,
// every row names the player, and drawMoneyFlow labels each line. See
// avatarHTML for how many initials it takes to keep a foursome distinct.
const PLAYER_PALETTES = {
  clubhouse: [
    "#00856d",
    "#c2412c",
    "#2b5cc4",
    "#8f6205",
    "#7d3cc0",
    "#00799e",
    "#4d7d18",
    "#b52478",
  ],
  broadcast: [
    "#11a798",
    "#f66346",
    "#8493e1",
    "#c98e18",
    "#b379f6",
    "#0fd2f0",
    "#b2cc5c",
    "#fb74c5",
  ],
  // Deep ink on white paper. The high-contrast floor (5.6:1 on #fff) pushes
  // every entry dark, which is also what gives this palette the best CVD
  // separation of the three -- lightness is free to vary here.
  sunlight: [
    "#1a5131",
    "#770821",
    "#110d5e",
    "#994b06",
    "#54096c",
    "#256ca2",
    "#666b29",
    "#c30466",
  ],
};
function cssVar(n, f) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return v || f;
}
const SKINS = ["clubhouse", "broadcast", "sunlight"];
const SKIN_DESC = {
  clubhouse: "The scorecard",
  broadcast: "The odds board",
  sunlight: "For direct sun",
};
/* A byte-mode QR encoder, error-correction level M, versions 1-10 (up to 213
   bytes: a watch link is ~60). Returns an array of rows of booleans, no
   quiet zone. Written for one job, checked module-for-module against a
   reference encoder in test. */
function qrEncode(str) {
  const bytes = [...new TextEncoder().encode(str)];
  // [total codewords, ec per block, [blocks, data cw]...] per version, level M
  const EC = [
    null,
    [26, 10, 1, 16],
    [44, 16, 1, 28],
    [70, 26, 1, 44],
    [100, 18, 2, 32],
    [134, 24, 2, 43],
    [172, 16, 4, 27],
    [196, 18, 4, 31],
    [242, 22, 2, 38, 2, 39],
    [292, 22, 3, 36, 2, 37],
    [346, 26, 4, 43, 1, 44],
  ];
  const ALIGN = [
    null,
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ];
  let ver = 0,
    dataCw = 0;
  for (let v = 1; v <= 10; v++) {
    const e = EC[v];
    const d = e[2] * e[3] + (e[4] ? e[4] * e[5] : 0);
    const need = 4 + (v < 10 ? 8 : 16) + 8 * bytes.length;
    if (need <= 8 * d) {
      ver = v;
      dataCw = d;
      break;
    }
  }
  if (!ver) return null;
  // bit stream
  const bits = [];
  const put = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  put(4, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  for (let i = 0; i < 4 && bits.length < 8 * dataCw; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
    data.push(b);
  }
  for (let p = 0; data.length < dataCw; p ^= 1) data.push(p ? 0x11 : 0xec);
  // GF(256)
  const EXP = new Array(512),
    LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const e = EC[ver],
    ecn = e[1];
  let gen = [1];
  for (let i = 0; i < ecn; i++) {
    const ng = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      ng[j] ^= gen[j];
      ng[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = ng;
  }
  const rs = (block) => {
    const r = block.concat(new Array(ecn).fill(0));
    for (let i = 0; i < block.length; i++) {
      const c = r[i];
      if (c) for (let j = 0; j < gen.length; j++) r[i + j] ^= mul(gen[j], c);
    }
    return r.slice(block.length);
  };
  const blocks = [],
    ecs = [];
  let off = 0;
  const groups = [[e[2], e[3]]];
  if (e[4]) groups.push([e[4], e[5]]);
  groups.forEach(([n, len]) => {
    for (let i = 0; i < n; i++) {
      const b = data.slice(off, off + len);
      off += len;
      blocks.push(b);
      ecs.push(rs(b));
    }
  });
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++)
    blocks.forEach((b) => {
      i < b.length && out.push(b[i]);
    });
  for (let i = 0; i < ecn; i++) ecs.forEach((b) => out.push(b[i]));
  // matrix
  const N = 17 + 4 * ver;
  const M = Array.from({ length: N }, () => new Array(N).fill(null));
  const F = Array.from({ length: N }, () => new Array(N).fill(!1));
  const set = (x, y, v) => {
    M[y][x] = v ? 1 : 0;
    F[y][x] = !0;
  };
  const finder = (x, y) => {
    for (let dy = -1; dy <= 7; dy++)
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const on =
          dx >= 0 &&
          dx <= 6 &&
          dy >= 0 &&
          dy <= 6 &&
          (dx === 0 ||
            dx === 6 ||
            dy === 0 ||
            dy === 6 ||
            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(xx, yy, on);
      }
  };
  finder(0, 0);
  finder(N - 7, 0);
  finder(0, N - 7);
  const al = ALIGN[ver];
  al.forEach((cy) =>
    al.forEach((cx) => {
      if (F[cy][cx]) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  for (let i = 8; i < N - 8; i++) {
    if (!F[6][i]) set(i, 6, i % 2 === 0);
    if (!F[i][6]) set(6, i, i % 2 === 0);
  }
  set(8, N - 8, 1);
  // reserve format (and version) areas
  for (let i = 0; i < 9; i++) {
    if (!F[8][i]) set(i, 8, 0);
    if (!F[i][8]) set(8, i, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!F[8][N - 1 - i]) set(N - 1 - i, 8, 0);
    if (!F[N - 1 - i][8]) set(8, N - 1 - i, 0);
  }
  if (ver >= 7) {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        set(i, N - 11 + j, 0);
        set(N - 11 + j, i, 0);
      }
  }
  // place data
  let bi = 0;
  const total = out.length * 8;
  const bit = (i) => (i < total ? (out[i >> 3] >> (7 - (i & 7))) & 1 : 0);
  for (let x = N - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let k = 0; k < N; k++) {
      const y = ((N - 1 - x) >> 1) % 2 === 0 ? N - 1 - k : k;
      for (const dx of [0, -1]) {
        const xx = x + dx;
        if (F[y][xx]) continue;
        M[y][xx] = bit(bi++);
      }
    }
  }
  const maskF = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => ((y >> 1) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const bch = (v, poly, n, k) => {
    let r = v << (n - k);
    for (let i = n - 1; i >= n - k; i--) if (r & (1 << i)) r ^= poly << (i - (n - k));
    return (v << (n - k)) | r;
  };
  const writeFormat = (m, mask) => {
    const f = bch((0 << 3) | mask, 0x537, 15, 5) ^ 0x5412;
    const b = (i) => (f >> i) & 1;
    for (let i = 0; i < 6; i++) m[8][i] = b(14 - i);
    m[8][7] = b(8);
    m[8][8] = b(7);
    m[7][8] = b(6);
    for (let i = 0; i < 6; i++) m[5 - i][8] = b(5 - i);
    for (let i = 0; i < 7; i++) m[N - 1 - i][8] = b(14 - i);
    for (let i = 0; i < 8; i++) m[8][N - 8 + i] = b(7 - i);
  };
  if (ver >= 7) {
    const vi = bch(ver, 0x1f25, 18, 6);
    for (let i = 0; i < 18; i++) {
      const b = (vi >> i) & 1;
      M[Math.floor(i / 3)][N - 11 + (i % 3)] = b;
      M[N - 11 + (i % 3)][Math.floor(i / 3)] = b;
    }
  }
  const penalty = (m) => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++)
      for (let y = 0; y < N; y++) {
        let run = 1;
        for (let x = 1; x <= N; x++) {
          const a = pass ? (x < N ? m[x][y] : null) : x < N ? m[y][x] : null,
            b = pass ? m[x - 1][y] : m[y][x - 1];
          if (x < N && a === b) run++;
          else {
            if (run >= 5) p += 3 + (run - 5);
            run = 1;
          }
        }
      }
    for (let y = 0; y < N - 1; y++)
      for (let x = 0; x < N - 1; x++) {
        const v = m[y][x];
        if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) p += 3;
      }
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
      pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let pass = 0; pass < 2; pass++)
      for (let y = 0; y < N; y++)
        for (let x = 0; x <= N - 11; x++) {
          let ok1 = !0,
            ok2 = !0;
          for (let k = 0; k < 11; k++) {
            const v = pass ? m[x + k][y] : m[y][x + k];
            if (v !== pat[k]) ok1 = !1;
            if (v !== pat2[k]) ok2 = !1;
            if (!ok1 && !ok2) break;
          }
          if (ok1) p += 40;
          if (ok2) p += 40;
        }
    let dark = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) dark += m[y][x];
    const pct = (dark * 100) / (N * N);
    const a = Math.floor(pct / 5) * 5,
      b = a + 5;
    p += Math.min(Math.abs(a - 50) / 5, Math.abs(b - 50) / 5) * 10;
    return p;
  };
  let best = null,
    bestP = 1 / 0;
  for (let mask = 0; mask < 8; mask++) {
    const m = M.map((r) => r.slice());
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (!F[y][x] && maskF[mask](x, y)) m[y][x] ^= 1;
    writeFormat(m, mask);
    const p = penalty(m);
    if (p < bestP) {
      bestP = p;
      best = m;
    }
  }
  return best.map((r) => r.map((v) => !!v));
}

/* The six characters are the entire point of going live, and they rendered
   as body text inside a confirm dialog while joining meant typing them from
   someone reading them aloud. The sheet shows the code at display size, tap
   to copy, a QR of the watch link underneath, and the link as a third way. */
function showLiveSheet(code) {
  const el = document.getElementById("live-sheet-content");
  if (!el || !code) return;
  const url = watchLinkURL() || "";
  el.innerHTML =
    '<p class="live-lede">Friends join as scorers with the code, or point a camera at the square to watch along.</p>' +
    '<button type="button" class="live-code" data-act="copyLiveCode()" aria-label="Share code ' +
    esc(code.split("").join(" ")) +
    '. Tap to copy"><span class="live-code-chars" aria-hidden="true">' +
    esc(code) +
    '</span><span class="live-code-hint">Tap to copy</span></button>' +
    '<div class="live-qr"><canvas id="live-qr" role="img" aria-label="QR code for the watch link"></canvas></div>' +
    '<div class="live-link">' +
    esc(url) +
    "</div>" +
    '<div class="app-dialog-actions"><button class="btn secondary" type="button" data-act="copyWatchLink()">Copy link</button><button class="btn primary" type="button" data-act="shareWatchLink()">' +
    (navigator.share ? "Share link" : "Open link") +
    "</button></div>";
  drawQR(document.getElementById("live-qr"), url);
  (document.getElementById("live-modal").classList.remove("hidden"), openModalA11y("live-modal"));
}
function drawQR(cv, text) {
  if (!cv || !text || "function" != typeof cv.getContext) return;
  const m = qrEncode(text);
  if (!m) return;
  const n = m.length,
    q = 4,
    dpr = window.devicePixelRatio || 1,
    px = Math.max(2, Math.floor((216 * dpr) / (n + 2 * q))),
    size = (n + 2 * q) * px;
  ((cv.width = size),
    (cv.height = size),
    (cv.style.width = cv.style.height = Math.round(size / dpr) + "px"));
  const g = cv.getContext("2d");
  if (!g) return;
  ((g.fillStyle = "#ffffff"), g.fillRect(0, 0, size, size), (g.fillStyle = "#000000"));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) m[y][x] && g.fillRect((x + q) * px, (y + q) * px, px, px);
}
function copyText(t, msg) {
  return (
    navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(t)
      : Promise.reject()
  ).then(
    () => {
      (showToast(msg, { type: "success" }), haptic());
    },
    () => appPrompt("Copy this:", { title: msg.replace(/ copied.*/, ""), initial: t }),
  );
}
function copyLiveCode() {
  state.liveCode && copyText(state.liveCode, "Code copied");
}
function shareWatchLink() {
  const l = watchLinkURL();
  if (!l) return;
  navigator.share
    ? navigator
        .share({
          title: "Watch our round on The Press",
          text: "Follow the money live. Code " + state.liveCode,
          url: l,
        })
        .catch(() => {})
    : window.open(l, "_blank", "noopener");
}

function activeSkin() {
  const t = document.documentElement.dataset.theme;
  return SKINS.includes(t) ? t : "clubhouse";
}
function paletteFor(skin) {
  return PLAYER_PALETTES[skin || activeSkin()] || PLAYER_PALETTES.clubhouse;
}
// Legacy rounds stored a hex; map it to the nearest slot so old players keep a
// stable, distinct identity instead of an off-palette colour.
function _hexRGB(h) {
  h = String(h || "").replace("#", "");
  if (3 === h.length)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, 255 & n];
}
function nearestColorIdx(hex) {
  const c = _hexRGB(hex);
  if (!c) return 0;
  let best = 0,
    bd = 1 / 0;
  Object.keys(PLAYER_PALETTES).forEach((k) =>
    PLAYER_PALETTES[k].forEach((p, i) => {
      const q = _hexRGB(p),
        d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2;
      d < bd && ((bd = d), (best = i));
    }),
  );
  return best;
}
function colorIdxOf(p) {
  if (!p) return 0;
  if (Number.isInteger(p.colorIdx)) return p.colorIdx % 8;
  if (p.color) {
    const i = nearestColorIdx(p.color);
    return ((p.colorIdx = i), i);
  }
  return 0;
}
function playerColor(p, skin) {
  return paletteFor(skin)[colorIdxOf(p)];
}
