/**
 * Exercises the two audit-entry paths the screenshot walk never touches:
 * MANUAL ENTRY and DRAG-AND-DROP PDF UPLOAD.
 *
 * The sample-audit shortcut was the only path ever tested, which left
 * auditFromManual() in app/page.tsx and its data/degree-template.json merge
 * completely unexecuted — and that merge is the sole producer of
 * requirements[].missing on the manual path, which is the only input to §11.1.
 * If it is wrong, manual entry reaches the diagnosis screen with nothing to
 * diagnose.
 *
 * Server must be running.  Then:  npx tsx scripts/test-audit-paths.ts
 * Exits non-zero if either path fails to reach a populated diagnosis.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".cache", "screens");

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

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

/** Everything up to and including landing on the audit step. */
async function toAuditStep(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await clickText(page, "sample");
  await clickText(page, "Next: your audit");
  await page.waitForFunction(
    () => document.body.innerText.includes("Or enter it manually"),
    { timeout: 60_000 },
  );
}

/** Reads the numbers the diagnosis screen is actually showing. */
async function readDiagnosis(page: Page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const codes = [...text.matchAll(/\b([A-Z]{2,4})\s(\d{3})\b/g)].map((m) => `${m[1]} ${m[2]}`);
    return {
      reachedDiagnosis: /graduate late|safe to delay/i.test(text),
      distinctCourses: [...new Set(codes)].length,
      sampleCodes: [...new Set(codes)].slice(0, 6),
      hasGapMap: /gap map/i.test(text),
      hasNaN: /NaN|undefined|\[object/i.test(text),
    };
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("no Edge or Chrome found");

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });

    const errors: string[] = [];
    page.on("pageerror", (e: unknown) => {
      errors.push(e instanceof Error ? e.message : String(e));
    });

    // ---- PATH 1: manual entry -------------------------------------------
    console.log("\nPATH 1 — manual entry (auditFromManual + degree-template.json)\n");
    await toAuditStep(page);
    await clickText(page, "Or enter it manually");
    await page.waitForFunction(
      () => document.body.innerText.includes("Run the diagnosis"),
      { timeout: 15_000 },
    );
    await clickText(page, "Run the diagnosis");
    await page.waitForFunction(
      () => /graduate late|safe to delay/i.test(document.body.innerText),
      { timeout: 60_000 },
    );
    await new Promise((r) => setTimeout(r, 700));

    const manual = await readDiagnosis(page);
    check("reaches the diagnosis screen", manual.reachedDiagnosis, "rendered");
    check(
      "requirements[].missing produced real courses",
      manual.distinctCourses >= 3,
      `${manual.distinctCourses} distinct codes, e.g. ${manual.sampleCodes.join(", ")}`,
    );
    check("gap map renders", manual.hasGapMap, "present");
    check("no NaN/undefined leaked to the DOM", !manual.hasNaN, "clean");
    await page.screenshot({
      path: path.join(outDir, "6-manual-entry.png") as `${string}.png`,
      fullPage: true,
    });

    // ---- PATH 2: PDF upload through the dropzone's file input -----------
    console.log("\nPATH 2 — PDF upload via the dropzone input\n");
    await toAuditStep(page);
    const input = (await page.$('input[type="file"]')) as ElementHandle<HTMLInputElement> | null;
    check("dropzone exposes a file input", input !== null, "found");
    if (input) {
      await input.uploadFile(path.join(root, "public", "sample-audit.pdf"));
      await page.waitForFunction(
        () => /graduate late|safe to delay/i.test(document.body.innerText),
        { timeout: 90_000 },
      );
      await new Promise((r) => setTimeout(r, 700));
      const upload = await readDiagnosis(page);
      check("upload reaches the diagnosis screen", upload.reachedDiagnosis, "rendered");
      check(
        "parsed audit produced real courses",
        upload.distinctCourses >= 3,
        `${upload.distinctCourses} distinct codes, e.g. ${upload.sampleCodes.join(", ")}`,
      );
      check("no NaN/undefined leaked to the DOM", !upload.hasNaN, "clean");
      await page.screenshot({
        path: path.join(outDir, "7-pdf-upload.png") as `${string}.png`,
        fullPage: true,
      });
    }

    check("no uncaught page errors", errors.length === 0, errors.join(" | ") || "none");
  } finally {
    await browser?.close();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
