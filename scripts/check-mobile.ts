/**
 * Renders every screen at phone width and fails on the things that actually
 * break a phone layout.
 *
 * Students register on phones. Every screenshot taken so far was 1440px, so the
 * mobile behaviour of a three-column schedule grid and a two-column diagnosis
 * screen was pure assumption. This checks the two failure modes that matter:
 * horizontal overflow (the page scrolls sideways) and tap targets below the
 * 24x24 CSS px floor in WCAG 2.2 SC 2.5.8.
 *
 * Server must be running.  Then:  npx tsx scripts/check-mobile.ts
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer-core";

import { requireBrowser } from "./find-browser";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".cache", "screens");

// iPhone 15 / Pixel 8 class. 390 is the most common real-world phone width.
const WIDTH = 390;
const HEIGHT = 844;

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
};

async function clickText(page: Page, text: string, tag = "button") {
  const handle = await page.evaluateHandle(
    (t: string, sel: string) =>
      [...document.querySelectorAll(sel)].find((el) =>
        (el.textContent ?? "").toLowerCase().includes(t.toLowerCase()),
      ) ?? null,
    text,
    tag,
  );
  const el = handle.asElement() as ElementHandle<Element> | null;
  if (!el) throw new Error(`no <${tag}> containing "${text}"`);
  await el.click();
}

/** The two things that actually break on a phone. */
async function audit(page: Page, name: string) {
  await new Promise((r) => setTimeout(r, 800));
  const result = await page.evaluate((vw: number) => {
    const doc = document.documentElement;
    // Anything wider than the viewport, ignoring elements that legitimately
    // scroll inside their own overflow container.
    const overflowing: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        let scrollableAncestor = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") { scrollableAncestor = true; break; }
        }
        if (!scrollableAncestor) {
          overflowing.push(
            `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} (${Math.round(r.width)}px)`,
          );
        }
      }
    }
    // WCAG 2.2 SC 2.5.8 Target Size (Minimum): 24x24 CSS px.
    const small: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("button, a, input, [role=button]"),
    )) {
      // Two exemptions, both for controls that are not targets at all. SC 2.5.8
      // sizes things a finger has to hit; neither of these is ever pointed at,
      // and counting them made the gate FAIL by design on three screens — a red
      // gate that is supposed to be red hides the next real regression.
      //
      //   sr-only — 1x1 by construction, with a visible sibling doing the
      //   pointing. AuditUpload's file input is the case here: it stays mounted
      //   past step 2, so it reaches the schedules screen too. audit-ui.ts
      //   makes this same exemption.
      //
      //   aria-hidden — removed from the accessibility tree, so by definition
      //   not a target. This is Base UI's form-participation input: Switch.Root
      //   renders `type=checkbox tabIndex=-1 aria-hidden=true` beside the real
      //   `role=switch` button (node_modules/@base-ui/react/switch/root/
      //   SwitchRoot.js:158-160), which is why the toggles put a 1x1 input on
      //   screen 4 only. The visible switch track is measured normally.
      if (el.classList.contains("sr-only")) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 24 || r.height < 24) {
        small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      overflowing: [...new Set(overflowing)].slice(0, 6),
      small: [...new Set(small)].slice(0, 6),
    };
  }, WIDTH);

  check(
    `${name}: no horizontal page scroll`,
    result.scrollW <= result.clientW + 1,
    `scrollWidth ${result.scrollW} vs viewport ${result.clientW}`,
  );
  check(
    `${name}: nothing overflows the viewport`,
    result.overflowing.length === 0,
    result.overflowing.join(" | ") || "clean",
  );
  check(
    `${name}: tap targets >= 24px (WCAG 2.2 SC 2.5.8)`,
    result.small.length === 0,
    result.small.join(" | ") || "clean",
  );

  await page.screenshot({
    path: path.join(outDir, `m-${name}.png`) as `${string}.png`,
    fullPage: true,
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const exe = requireBrowser();

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    const errors: string[] = [];
    page.on("pageerror", (e: unknown) => {
      errors.push(e instanceof Error ? e.message : String(e));
    });

    console.log(`\nphone viewport ${WIDTH}x${HEIGHT}\n`);

    await page.goto(BASE, { waitUntil: "networkidle2" });
    await audit(page, "1-postings");

    await clickText(page, "sample");
    await clickText(page, "Next: your audit");
    await page.waitForFunction(
      () => document.body.innerText.includes("Or enter it manually"),
      { timeout: 60_000 },
    );
    await audit(page, "2-audit");

    await clickText(page, "Use the sample audit");
    await page.waitForFunction(
      () => /graduate late|waiting on|safe to delay/i.test(document.body.innerText),
      { timeout: 90_000 },
    );
    await audit(page, "3-diagnosis");

    await clickText(page, "Build my semester");
    await page.waitForFunction(
      () => /tradeoff/i.test(document.body.innerText),
      { timeout: 90_000 },
    );
    await audit(page, "4-schedules");

    await page.goto(`${BASE}/register?crns=79379,77906,78862`, { waitUntil: "networkidle2" });
    await audit(page, "5-register");

    check("no uncaught page errors", errors.length === 0, errors.join(" | ") || "none");
  } finally {
    await browser?.close();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
