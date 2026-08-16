// One browser lookup, shared by the four scripts that drive one.
//
// Three of them are puppeteer (`shoot-screens`, `check-mobile`,
// `make-sample-pdf`) and one is Playwright (`audit-ui`), and both libraries
// take an explicit `executablePath` — so the search itself has no business
// being duplicated four times, least of all as four copies of a hardcoded
// path list that had already drifted apart.
//
// ORDER, and why each step is there:
//
//   1. CHROME_PATH — the explicit override. Puppeteer's own convention.
//   2. $PATH — `chromium`, `chromium-browser`, `google-chrome`… by NAME.
//      This is the step that was missing, and it is the one that matters on
//      NixOS: a nix-store path is content-addressed and therefore unguessable
//      by construction, so no hardcoded list can ever contain it, but the
//      devshell puts the binary on PATH like any other tool. Neither library
//      does this lookup itself — verified, not assumed: with a nix chromium
//      first on PATH, Playwright's three channels still resolve to
//      /opt/microsoft/msedge/msedge, /opt/google/chrome/chrome, and its own
//      undownloaded bundle. `channel: "chromium"` is not a system-browser
//      lookup at all; it means "Playwright's own build".
//   3. The well-known install paths, for a normal Windows/macOS/Linux box
//      where the browser is not on PATH.
//
// There is deliberately no download fallback. `npx playwright install` is not
// part of this repo's setup and pulling ~150 MB mid-gate would be a surprise.

import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";

/** Binary names to look for on $PATH, best first. */
const NAMES = [
  "chromium",
  "chromium-browser",
  "google-chrome-stable",
  "google-chrome",
  "microsoft-edge",
  "microsoft-edge-stable",
  "brave",
];

/**
 * Well-known absolute locations, for machines where the browser is installed
 * but not on PATH. Windows first (where this project was started), then macOS,
 * then the common Linux prefixes. `existsSync` only ever matches one platform's
 * paths, so the order between the groups is cosmetic.
 */
const WELL_KNOWN = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/opt/microsoft/msedge/msedge",
  "/opt/google/chrome/chrome",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

function onPath(name: string): string | null {
  try {
    // `command -v` rather than `which`: it is a shell builtin, so it is present
    // on any POSIX shell, and `which` is genuinely absent from some minimal
    // images. On Windows this throws and we fall through to WELL_KNOWN, which
    // is where the Windows paths live anyway.
    const hit = execFileSync("/bin/sh", ["-c", `command -v ${name}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!hit) return null;
    accessSync(hit, constants.X_OK);
    return hit;
  } catch {
    return null;
  }
}

/**
 * An executable Chromium-family browser, or null if there is none. Callers
 * decide whether that is fatal — `make-sample-pdf` has a no-browser fallback
 * and the three gates do not.
 */
export function findBrowser(): string | null {
  const explicit = process.env.CHROME_PATH;
  if (explicit) return explicit;
  for (const name of NAMES) {
    const hit = onPath(name);
    if (hit) return hit;
  }
  return WELL_KNOWN.find((p) => existsSync(p)) ?? null;
}

/** Same, but throws the message every one of these scripts used to carry. */
export function requireBrowser(): string {
  const hit = findBrowser();
  if (!hit) {
    throw new Error(
      "No Chromium-family browser found. Install one, put it on PATH, or set CHROME_PATH.",
    );
  }
  return hit;
}
