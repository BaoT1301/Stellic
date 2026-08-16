/**
 * Full UI audit: Playwright walks every screen at desktop and phone width,
 * screenshots each one, and runs an axe-core WCAG 2.1 AA scan.
 *
 * Why axe rather than eyeballing: ADA Title II makes WCAG 2.1 AA the technical
 * standard for public institutions, and accessibility questionnaires are already
 * in these judges' procurement packets. A measured result is worth more than a
 * claim, and "targets WCAG 2.1 AA" is only sayable in the write-up if something
 * actually checked.
 *
 * Uses a browser already installed on the machine, located by
 * scripts/find-browser.ts, so there is no bundled-browser download and nothing
 * ships to prod. See launchBrowser() below for why Playwright's `channel`
 * option cannot do that job.
 *
 * Server must be running.  Then:  npx tsx scripts/audit-ui.ts
 * Screens land in .cache/screens/ (gitignored). Exits non-zero on a serious
 * finding: a page error, horizontal overflow, or a critical/serious axe violation.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

import { findBrowser } from "./find-browser";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".cache", "screens");

type Viewport = { name: string; width: number; height: number; isMobile: boolean };
const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "phone", width: 390, height: 844, isMobile: true },
];

interface Violation {
  viewport: string;
  screen: string;
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

const violations: Violation[] = [];
const problems: string[] = [];
const notes: string[] = [];

/**
 * Records the failure and KEEPS GOING. An audit that aborts on the first failed
 * interaction reports one problem and hides the rest — and the first run of this
 * script did exactly that, stopping at phone/3-diagnosis and never scanning
 * screens 4 or 5.
 */
async function step(page: Page, label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    problems.push(`${label}: ${msg}`);
    console.log(`    STEP FAILED — ${msg}`);
    return false;
  }
}

/** axe scan limited to the WCAG 2.1 A/AA rule set. */
async function scan(page: Page, viewport: string, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of results.violations) {
    violations.push({
      viewport,
      screen,
      id: v.id,
      impact: v.impact ?? "unknown",
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    });
  }
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  ).length;
  console.log(
    `    axe: ${results.violations.length} violation type(s), ${serious} critical/serious`,
  );
}

/** Layout facts that matter on a phone. */
async function layout(page: Page, viewport: string, screen: string) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const over: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > vw + 1 || b.left < -1) {
        let scrollable = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") { scrollable = true; break; }
        }
        if (!scrollable) {
          over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
        }
      }
    }
    const small: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("button, a, input, [role=button], summary"),
    )) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // sr-only controls are 1x1 by construction and are never pointed at —
      // the visible button proxies for them. Counting them as tap targets is a
      // false positive in this check, not a real WCAG 2.5.8 failure.
      if (el.classList.contains("sr-only")) continue;
      // Same reasoning, different mechanism: aria-hidden takes an element out
      // of the accessibility tree, so it is not a target at all. This is Base
      // UI's form-participation input — Switch.Root renders `type=checkbox
      // tabIndex=-1 aria-hidden=true` beside the real `role=switch` button
      // (@base-ui/react/switch/root/SwitchRoot.js:158-160) — which is why the
      // preference toggles put a 1x1 input on screen 4 only. Without this the
      // two harnesses disagree about one element and the NOTE invites someone
      // to "fix" a control that is correct. check-mobile.ts skips it too.
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (b.width < 24 || b.height < 24) {
        small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 22)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
    }
    return {
      scrollW: doc.scrollWidth,
      clientW: vw,
      over: [...new Set(over)].slice(0, 5),
      small: [...new Set(small)].slice(0, 5),
    };
  });

  if (r.scrollW > r.clientW + 1) {
    problems.push(
      `${viewport}/${screen}: HORIZONTAL SCROLL — scrollWidth ${r.scrollW} vs viewport ${r.clientW}`,
    );
  }
  if (r.over.length) {
    problems.push(`${viewport}/${screen}: overflows viewport — ${r.over.join(", ")}`);
    console.log(`      offenders: ${r.over.join(", ")}`);
  }
  if (r.small.length) {
    notes.push(`${viewport}/${screen}: tap targets under 24px — ${r.small.join(", ")}`);
  }
  console.log(
    `    layout: scrollW ${r.scrollW}/${r.clientW}, ${r.over.length} overflow, ${r.small.length} small targets`,
  );
}

async function shoot(page: Page, viewport: string, screen: string) {
  await page.screenshot({
    path: path.join(outDir, `${viewport}-${screen}.png`),
    fullPage: true,
  });
}

async function visit(page: Page, viewport: string, screen: string) {
  await page.waitForTimeout(700);
  console.log(`  ${screen}`);
  await layout(page, viewport, screen);
  await scan(page, viewport, screen);
  await shoot(page, viewport, screen);
}

async function walk(browser: Browser, vp: Viewport) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${vp.name}: pageerror ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${vp.name}: console.error ${m.text()}`);
  });

  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await visit(page, vp.name, "1-postings");

  await step(page, `${vp.name} load samples`, async () => {
    await page.getByRole("button", { name: /sample postings/i }).click();
    await page.waitForTimeout(600);
  });
  await visit(page, vp.name, "1-postings-filled");

  await step(page, `${vp.name} to audit`, async () => {
    await page.getByRole("button", { name: /next: your audit/i }).click();
    await page.getByText(/or enter it manually/i).waitFor({ timeout: 60_000 });
  });
  await visit(page, vp.name, "2-audit");

  await step(page, `${vp.name} use sample audit`, async () => {
    await page.getByRole("button", { name: /use the sample audit/i }).click();
    await page
      .getByText(/graduate late|holding up the rest/i)
      .first()
      .waitFor({ timeout: 120_000 });
  });
  await visit(page, vp.name, "3-diagnosis");

  // The collapsed group is the headline layout change — open it and look.
  await step(page, `${vp.name} expand delay group`, async () => {
    const d = page.locator("details").first();
    if (await d.count()) {
      await d.locator("summary").first().click();
      await page.waitForTimeout(500);
    }
  });
  await visit(page, vp.name, "3-diagnosis-expanded");

  await step(page, `${vp.name} build schedules`, async () => {
    await page.getByRole("button", { name: /build my semester/i }).click();
    await page.getByText(/tradeoff/i).first().waitFor({ timeout: 120_000 });
  });
  await visit(page, vp.name, "4-schedules");

  // "Why this?" is new and never rendered — open the first one.
  await step(page, `${vp.name} open Why this`, async () => {
    const why = page.getByText(/why this\?/i).first();
    if (await why.count()) {
      await why.click();
      await page.waitForTimeout(400);
    }
  });
  await visit(page, vp.name, "4-schedules-why");

  await page.goto(`${BASE}/register?crns=79379,77906,78862`, { waitUntil: "networkidle" });
  await visit(page, vp.name, "5-register");

  await context.close();
}

/**
 * The browser `scripts/find-browser.ts` found, driven by explicit
 * `executablePath` exactly the way the three puppeteer gates drive theirs.
 *
 * This used to try `channel: "msedge" | "chrome" | "chromium"` in turn and fall
 * back to Playwright's bundle. Every step of that is wrong on this machine, and
 * measurably so — with a nix-store chromium FIRST on PATH, the three channels
 * still resolve to /opt/microsoft/msedge/msedge, /opt/google/chrome/chrome, and
 * ~/.cache/ms-playwright/. Playwright does not consult PATH for browsers, and
 * `channel: "chromium"` is not a system-browser lookup at all — it means
 * "Playwright's own build", which is the same undownloaded bundle the final
 * fallback wanted. So all four steps failed for one of two reasons and the gate
 * could not start.
 *
 * The channel list is kept only as a last resort, for a machine that really
 * does have Edge or Chrome at a standard prefix and where find-browser somehow
 * missed it.
 */
async function launchBrowser(): Promise<Browser> {
  const exe = findBrowser();
  if (exe) return chromium.launch({ executablePath: exe, headless: true });

  for (const channel of ["msedge", "chrome"] as const) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // try the next channel
    }
  }
  throw new Error(
    "No Chromium-family browser found. Install one, put it on PATH, or set CHROME_PATH.",
  );
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    for (const vp of VIEWPORTS) await walk(browser, vp);
  } finally {
    await browser.close();
  }

  // ---- report ----------------------------------------------------------
  const byId = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byId.get(v.id) ?? [];
    list.push(v);
    byId.set(v.id, list);
  }

  console.log(`\n${"=".repeat(64)}\nACCESSIBILITY (axe-core, WCAG 2.1 A/AA)\n${"=".repeat(64)}`);
  if (byId.size === 0) {
    console.log("  no violations");
  } else {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>;
    for (const [id, list] of [...byId.entries()].sort(
      (a, b) => (order[a[1][0]!.impact] ?? 9) - (order[b[1][0]!.impact] ?? 9),
    )) {
      const f = list[0]!;
      const where = [...new Set(list.map((v) => `${v.viewport}/${v.screen}`))];
      console.log(`\n  [${f.impact}] ${id} — ${f.help}`);
      console.log(`    on: ${where.slice(0, 6).join(", ")}${where.length > 6 ? ` +${where.length - 6}` : ""}`);
      console.log(`    e.g. ${f.nodes.join(" | ")}`);
    }
  }

  console.log(`\n${"=".repeat(64)}\nLAYOUT / RUNTIME PROBLEMS\n${"=".repeat(64)}`);
  console.log(problems.length ? problems.map((p) => "  " + p).join("\n") : "  none");

  console.log(`\n${"=".repeat(64)}\nNOTES\n${"=".repeat(64)}`);
  console.log(notes.length ? notes.map((n) => "  " + n).join("\n") : "  none");

  writeFileSync(
    path.join(outDir, "audit.json"),
    JSON.stringify({ violations, problems, notes }, null, 2),
  );

  const blocking =
    problems.length +
    violations.filter((v) => v.impact === "critical" || v.impact === "serious").length;
  console.log(`\n${blocking === 0 ? "AUDIT CLEAN" : `${blocking} BLOCKING FINDING(S)`}\n`);
  process.exit(blocking === 0 ? 0 : 1);
}

void main();
