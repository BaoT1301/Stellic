/**
 * make-sample-pdf.ts — samples/sample-audit.html  ->  public/sample-audit.pdf
 *
 * Run with:  npx tsx scripts/make-sample-pdf.ts    (cwd must be the repo root)
 *
 * WHY this script exists rather than a checked-in binary with no provenance:
 * CLAUDE.md §14 step 2 says the sample audit is authored as "a styled HTML page
 * printed to PDF". The HTML is the editable source of truth; this script is the
 * reproducible printer. CLAUDE.md §18 calls sample-audit.pdf "the biggest
 * remaining risk" and §15 schedules a 30-minute tuning pass on Aug 17 — that
 * pass edits samples/sample-audit.html and re-runs this script. Regenerating the
 * PDF must therefore be one command, not a manual browser print.
 *
 * The output MUST contain real, selectable text: app/api/parse-audit runs it
 * through pdf-parse v2 (`new PDFParse({data}).getText()`), so a rasterised page
 * image would silently break the entire demo path. This script proves that at
 * the end of every run instead of assuming it.
 *
 * Three strategies, tried in order. The first that produces a PDF wins:
 *
 *   (a) puppeteer, if it happens to be installed. It is NOT a dependency —
 *       CLAUDE.md §14 pins the dependency list and adding a ~300 MB Chromium
 *       download to satisfy a build-time script would be a bad trade. Dynamic
 *       import inside a try/catch, so its absence costs nothing.
 *   (b) any headless Chrome or Edge already on the machine, via
 *       --headless --print-to-pdf. This is the path that actually runs on the
 *       dev box: Edge ships with Windows, so there is nothing to install.
 *   (c) a minimal from-scratch PDF writer over the HTML's extracted text.
 *       Unstyled, and deliberately so — it exists purely so that a machine with
 *       no browser at all still produces a file whose text pdf-parse can
 *       extract. Never silently preferred over (a) or (b); force it with
 *       SAMPLE_PDF_FORCE_FALLBACK=1 to check that it still works.
 *
 * Zero new npm dependencies in every path. No network. No OpenAI.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findBrowser } from "./find-browser";

const REPO_ROOT = process.cwd();
const HTML_SRC = path.join(REPO_ROOT, "samples", "sample-audit.html");
const PDF_OUT = path.join(REPO_ROOT, "public", "sample-audit.pdf");

// ---------------------------------------------------------------------------
// (a) puppeteer, only if it is already installed
// ---------------------------------------------------------------------------

async function tryPuppeteer(html: string): Promise<boolean> {
  let launch: (opts: Record<string, unknown>) => Promise<PuppeteerBrowser>;
  try {
    // Non-literal specifier keeps TypeScript from demanding the types of an
    // optional package that is deliberately not in package.json.
    const specifier = "puppeteer";
    const mod = (await import(specifier)) as {
      default?: { launch: typeof launch };
      launch?: typeof launch;
    };
    const resolved = mod.launch ?? mod.default?.launch;
    if (!resolved) throw new Error("no launch export");
    launch = resolved;
  } catch {
    console.log("[a] puppeteer not installed — skipping");
    return false;
  }

  try {
    const browser = await launch({ headless: true });
    try {
      const page = await browser.newPage();
      // setContent needs no file:// base: sample-audit.html is fully
      // self-contained (inline <style>, no images, no webfonts).
      await page.setContent(html, { waitUntil: "load" });
      await page.pdf({
        path: PDF_OUT,
        format: "letter",
        printBackground: true,
        margin: { top: "0.45in", bottom: "0.45in", left: "0.45in", right: "0.45in" },
      });
    } finally {
      await browser.close();
    }
    console.log("[a] wrote PDF with puppeteer");
    return true;
  } catch (err) {
    console.log("[a] puppeteer failed:", (err as Error).message);
    return false;
  }
}

/** Minimal structural type for the optional puppeteer dependency. */
interface PuppeteerBrowser {
  newPage(): Promise<{
    setContent(html: string, opts: Record<string, unknown>): Promise<void>;
    pdf(opts: Record<string, unknown>): Promise<unknown>;
  }>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// (b) headless Chrome / Edge already on the machine
// ---------------------------------------------------------------------------

function chromeCandidates(): string[] {
  // scripts/find-browser.ts first — it is the only one of these that looks at
  // $PATH, which is where a nix-store browser lives. The Windows entries below
  // stay because they read the real ProgramFiles environment variables rather
  // than assuming C:, which the shared list does not do.
  const pf = process.env["ProgramFiles"] ?? "C:/Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)";
  const local = process.env.LOCALAPPDATA ?? "";

  const shared = findBrowser();

  return [
    ...(shared ? [shared] : []),
    // Windows — Edge is the reliable one, it ships with the OS.
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    local ? path.join(local, "Google/Chrome/Application/chrome.exe") : "",
  ].filter((p, i, all) => p !== "" && all.indexOf(p) === i && existsSync(p));
}

function tryHeadlessBrowser(): boolean {
  const browsers = chromeCandidates();
  if (browsers.length === 0) {
    console.log("[b] no Chrome or Edge binary found — skipping");
    return false;
  }

  const srcUrl = pathToFileURL(HTML_SRC).href;

  for (const exe of browsers) {
    // --headless=new is correct on Chrome/Edge 112+; plain --headless is the
    // old spelling that still works on older builds. Try both rather than
    // sniffing versions.
    for (const headlessFlag of ["--headless=new", "--headless"]) {
      // A throwaway profile: --print-to-pdf silently no-ops when the default
      // profile is locked by a browser window the user already has open.
      const profileDir = mkdtempSync(path.join(tmpdir(), "reverse-audit-print-"));
      try {
        const args = [
          headlessFlag,
          "--disable-gpu",
          "--no-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          `--user-data-dir=${profileDir}`,
          // Stops the browser stamping "file:///...  1/2  8/13/26" into the page
          // margins, which would land inside the pdf-parse text output.
          "--no-pdf-header-footer",
          "--print-to-pdf-no-header", // older spelling; unknown flags are ignored
          "--run-all-compositor-stages-before-draw",
          "--virtual-time-budget=5000",
          `--print-to-pdf=${PDF_OUT}`,
          srcUrl,
        ];

        const res = spawnSync(exe, args, { timeout: 90_000, stdio: "pipe" });

        if (existsSync(PDF_OUT) && statSync(PDF_OUT).size > 2000) {
          console.log(`[b] wrote PDF with ${path.basename(exe)} (${headlessFlag})`);
          return true;
        }
        const stderr = res.stderr?.toString().trim().split("\n").slice(-2).join(" ") ?? "";
        console.log(`[b] ${path.basename(exe)} ${headlessFlag} produced nothing. ${stderr}`);
      } catch (err) {
        console.log(`[b] ${path.basename(exe)} threw:`, (err as Error).message);
      } finally {
        try {
          rmSync(profileDir, { recursive: true, force: true });
        } catch {
          // A locked temp profile is not worth failing the build over.
        }
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// (c) last-resort minimal PDF writer
// ---------------------------------------------------------------------------

// BREAK marks a line break, GAP a column gap. They are sentinels rather than
// "\n" and "  " because sample-audit.html is prettier-formatted — every tag sits
// on its own source line, so splitting on the source newlines would put each
// table cell on its own row and the audit would read as a ten-page single
// column instead of a table.
const BREAK = "\u0001";
const GAP = "\u0002";

/** HTML -> plain text lines. Good enough for a fallback; not a real parser. */
function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    // Table cells become columns; rows and blocks become lines.
    .replace(/<\/t[dh]>/gi, GAP)
    .replace(/<\/(tr|p|div|h1|h2|h3|li|table)>/gi, BREAK)
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<[^>]+>/g, "")
    // Source-file newlines and indentation are layout noise; only the two
    // sentinels decide where a line ends and where a column gap goes.
    .replace(/[\r\n\t]+/g, " ")
    .replace(new RegExp(GAP, "g"), "  ")
    .replace(new RegExp(BREAK, "g"), "\n")
    // Entities used in sample-audit.html, plus the generic numeric form.
    .replace(/&#10003;/g, "[x]")
    .replace(/&#10007;/g, "[ ]")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    // Helvetica/WinAnsiEncoding cannot render these; the fallback is ASCII-only
    // so that pdf-parse gets clean, greppable text.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2713\u2714]/g, "[x]")
    .replace(/[\u2717\u2718]/g, "[ ]")
    .replace(/[^\x20-\x7E\n]/g, " ");

  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/ {3,}/g, "  ").replace(/^ +| +$/g, "");
    if (line === "") {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }
    // Soft-wrap at ~104 chars so nothing runs off the page edge.
    let rest = line;
    while (rest.length > 104) {
      let cut = rest.lastIndexOf(" ", 104);
      if (cut < 40) cut = 104;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ +/, "");
    }
    out.push(rest);
  }
  return out;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function writeMinimalPdf(lines: string[]): void {
  const PAGE_W = 612; // US Letter, 72 dpi units
  const PAGE_H = 792;
  const MARGIN_X = 40;
  const TOP = PAGE_H - 48;
  const FONT_SIZE = 9;
  const LEADING = 11.4;
  const LINES_PER_PAGE = Math.floor((TOP - 48) / LEADING);

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push(["(empty)"]);

  // Object numbering: 1 catalog, 2 pages, 3 font, then per page a page object
  // and a content object.
  const objects: string[] = [];
  const FIRST_PAGE_OBJ = 4;
  const pageObjNums = pages.map((_p, i) => FIRST_PAGE_OBJ + i * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(" ")}] >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  pages.forEach((pageLines, p) => {
    const pageObj = FIRST_PAGE_OBJ + p * 2;
    const contentObj = pageObj + 1;

    const body = pageLines
      .map((l, i) =>
        i === 0
          ? `1 0 0 1 ${MARGIN_X} ${TOP.toFixed(2)} Tm (${pdfEscape(l)}) Tj`
          : `T* (${pdfEscape(l)}) Tj`,
      )
      .join("\n");

    const stream = `BT\n/F1 ${FONT_SIZE} Tf\n${LEADING} TL\n${body}\nET`;

    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  const maxObj = objects.length - 1;
  const chunks: Buffer[] = [];
  const offsets: number[] = new Array(maxObj + 1).fill(0);
  let cursor = 0;

  const push = (s: string) => {
    const b = Buffer.from(s, "latin1");
    chunks.push(b);
    cursor += b.length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  for (let n = 1; n <= maxObj; n++) {
    if (objects[n] === undefined) continue;
    offsets[n] = cursor;
    push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  writeFileSync(PDF_OUT, Buffer.concat(chunks));
  console.log(`[c] wrote PDF with the built-in writer (${pages.length} pages, no styling)`);
}

// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(HTML_SRC)) {
    console.error(`missing source: ${HTML_SRC}`);
    process.exit(1);
  }

  mkdirSync(path.dirname(PDF_OUT), { recursive: true });
  // Remove any previous output so an existence check cannot pass on a stale file.
  if (existsSync(PDF_OUT)) rmSync(PDF_OUT);

  const html = readFileSync(HTML_SRC, "utf8");

  // Escape hatch so strategy (c) can actually be exercised on a machine that
  // has a browser. An untested fallback is not a fallback.
  const forceFallback = process.env.SAMPLE_PDF_FORCE_FALLBACK === "1";
  if (forceFallback) console.log("SAMPLE_PDF_FORCE_FALLBACK=1 — skipping (a) and (b)");

  let ok = forceFallback ? false : await tryPuppeteer(html);
  if (!ok && !forceFallback) ok = tryHeadlessBrowser();
  if (!ok) {
    if (!forceFallback) console.log("[c] falling back to the built-in PDF writer");
    writeMinimalPdf(htmlToLines(html));
    ok = existsSync(PDF_OUT);
  }

  if (!ok) {
    console.error("could not produce public/sample-audit.pdf by any strategy");
    process.exit(1);
  }

  const bytes = statSync(PDF_OUT).size;
  console.log(`\npublic/sample-audit.pdf  ${bytes.toLocaleString()} bytes`);

  // Prove the text is extractable before anyone trusts the file. This is the
  // exact call app/api/parse-audit/route.ts makes (CLAUDE.md §12.1), so if it
  // does not print the audit here it will not work in the route either.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: readFileSync(PDF_OUT) });
  try {
    const { text } = await parser.getText();
    const flat = text.replace(/\s+/g, " ");
    // Two kinds of marker, and both matter.
    //
    // The course codes and the credit total are the DEMO SHAPE: §11.1 needs
    // CS 262 outstanding (it gates CS 367, which gates CS 471), and 86 of 120
    // is the one credit number this repo now uses everywhere. If any of these
    // stops appearing, the parse still "succeeds" and the product quietly tells
    // a different story.
    //
    // The status words are the VENDOR SHAPE. George Mason's degree audit runs on
    // Stellic, whose student-facing vocabulary is Satisfied / In Progress /
    // Remaining / Milestones, with Catalog Year on the header. This assertion is
    // what stops the sample drifting back into DegreeWorks language, which would
    // be a wrong domain claim in front of the judges (§0 rule 7).
    const mustContain = [
      "G01847362",
      "86 of 120",
      "CS 262",
      "CS 367",
      "CS 471",
      "CS 450",
      "CS 483",
      "Catalog Year",
      "Satisfied",
      "In Progress",
      "Remaining",
      "Milestones",
    ];
    const missing = mustContain.filter((needle) => !flat.includes(needle));

    console.log(`extracted ${text.length.toLocaleString()} characters of text`);
    console.log("--- first 600 chars ---");
    console.log(text.slice(0, 600));
    console.log("-----------------------");

    if (missing.length > 0) {
      console.error(`FAIL: extracted text is missing ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log("OK: pdf-parse found every expected marker");
  } finally {
    await parser.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
