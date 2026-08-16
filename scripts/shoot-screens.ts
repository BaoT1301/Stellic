/**
 * Walks the four §13 states in a real browser and screenshots each one.
 *
 * This exists because "Design and experience" is one of the five equally
 * weighted judging criteria (§3) and every component in this app was written
 * without anyone ever opening it. It drives the Edge already installed on the
 * machine through puppeteer-core, so there is no bundled-Chromium download and
 * no runtime dependency — puppeteer-core is a devDependency only.
 *
 * Run the server first:  npm run build && npm start
 * Then:                  npm run gate:screens
 * Screens land in .cache/screens/ (gitignored).
 *
 * BASE_URL overrides the default, which is 3000 — the port `next start` uses
 * and the one check-mobile.ts and audit-ui.ts already default to. It used to
 * default to 3112 while claiming `npm run start` in this very comment, so the
 * documented invocation could not work.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, {
  type Browser,
  type ElementHandle,
  type Page,
} from "puppeteer-core";

import { requireBrowser } from "./find-browser";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".cache", "screens");

/** Click the first element whose visible text contains `text`. */
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

async function shoot(page: Page, name: string) {
  await new Promise((r) => setTimeout(r, 900));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file as `${string}.png`, fullPage: true });
  const title = await page.evaluate(() => document.body.innerText.slice(0, 90).replace(/\s+/g, " "));
  console.log(`  ${name.padEnd(22)} ${title}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: requireBrowser(),
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });

    const errors: string[] = [];
    page.on("pageerror", (e: unknown) => {
      errors.push(`pageerror: ${e instanceof Error ? e.message : String(e)}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });

    console.log(`\ndriving ${BASE}\n`);

    await page.goto(BASE, { waitUntil: "networkidle2" });
    await shoot(page, "1-postings-empty");

    await clickText(page, "sample");
    await shoot(page, "1-postings-filled");

    await clickText(page, "Next: your audit");
    await page.waitForFunction(
      () => document.body.innerText.includes("Use the sample audit"),
      { timeout: 60_000 },
    );
    await shoot(page, "2-audit");

    await clickText(page, "Use the sample audit");
    await page.waitForFunction(
      () =>
        document.body.innerText.toLowerCase().includes("graduate late") ||
        document.body.innerText.toLowerCase().includes("safe to delay"),
      { timeout: 60_000 },
    );
    await shoot(page, "3-diagnosis");

    await clickText(page, "Build my semester");
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("tradeoff"),
      { timeout: 60_000 },
    );
    await shoot(page, "4-schedules");

    await page.goto(`${BASE}/register?crns=79379,77906,78862`, { waitUntil: "networkidle2" });
    await shoot(page, "5-register");

    console.log(
      errors.length === 0
        ? "\nno page errors\n"
        : `\n${errors.length} PAGE ERROR(S):\n  ${errors.join("\n  ")}\n`,
    );
    process.exitCode = errors.length === 0 ? 0 : 1;
  } finally {
    await browser?.close();
  }
}

void main();
