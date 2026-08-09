// Assembles the native app's web payload (mobile/www) from the existing
// web app at the repo root. Does not modify any root files — copy only.
import { mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, '..');
const repoRoot = join(mobileDir, '..');
const www = join(mobileDir, 'www');

// The self-contained web app + its PWA assets. index.html carries all CSS/JS inline.
const ASSETS = ['index.html', 'sw.js', 'manifest.json', 'logo.png', 'logo-192.png', 'logo-64.png'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let copied = 0;
for (const a of ASSETS) {
  const src = join(repoRoot, a);
  if (!existsSync(src)) { console.warn('  ! missing, skipped:', a); continue; }
  copyFileSync(src, join(www, a));
  copied++;
}
if (!existsSync(join(www, 'index.html'))) {
  console.error('FATAL: index.html not found at repo root'); process.exit(1);
}
console.log(`Assembled ${copied} web asset(s) into mobile/www/`);
