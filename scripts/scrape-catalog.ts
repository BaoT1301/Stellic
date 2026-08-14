// scrape-catalog.ts — Source A of two (CLAUDE.md §9.1).
//
// GMU CourseLeaf publishes descriptions, credits and prerequisites. It does NOT
// publish CRNs, meeting times or instructors — those come from Banner 8 in
// scrape-sections.ts. Two sources, because that is how every registrar's stack
// is actually laid out.
//
// RUN ORDER MATTERS:
//   1. npx tsx scripts/scrape-catalog.ts    → writes data/courses.json (sections: [])
//   2. npx tsx scripts/scrape-sections.ts   → merges sections + termsOffered in place
// Re-running step 1 resets sections to [], so always follow it with step 2.
//
// Compliance (§9.1): robots.txt allows /courses/ and DISALLOWS /search/. Every
// prereq course reference is an <a href="/search/?P=CS%20211">. We never follow
// those hrefs — the anchor's title attribute already carries the canonical code,
// which is also exactly what build-prereqs.ts needs. One rule closes both the
// compliance and the correctness angle.

import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";

const SUBJECTS = ["cs", "math", "stat", "it", "engh", "phys"] as const;

const REPO_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache");
const OUT_FILE = path.join(REPO_ROOT, "data", "courses.json");

// §9.1: be polite — sequential requests, ~500ms delay, real user-agent.
const DELAY_MS = 500;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// The Course shape we emit here is the frozen §8 contract minus the Banner-only
// fields, which scrape-sections.ts fills in. Importing the real type keeps this
// honest — if lib/types.ts moves, this stops compiling.
import type { Course, Term } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * LOAD-BEARING (§9.1). GMU puts U+00A0 between subject and number — 613 of them
 * on the CS page alone. `/[A-Z]{2,4} \d{3}/` matches ZERO courses against the raw
 * text and fails SILENTLY: the scraper "runs fine" and writes an empty file.
 * This must run before any regex touches the string.
 */
function normalize(s: string): string {
  return s
    .replace(/\u00a0/g, " ") // FIRST. Always first.
    .replace(/\u2019/g, "'") // curly apostrophes → ASCII, so codes/quotes compare
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSubject(subject: string): Promise<string> {
  const cacheFile = path.join(CACHE_DIR, `catalog-${subject}.html`);
  if (fs.existsSync(cacheFile)) {
    console.log(`  [cache] catalog/${subject}`);
    return fs.readFileSync(cacheFile, "utf8");
  }

  const url = `https://catalog.gmu.edu/courses/${subject}/`;
  console.log(`  [net]   GET ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const html = await res.text();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, "utf8");
  await sleep(DELAY_MS);
  return html;
}

/**
 * Extract the "Required Prerequisites:" expression, and ONLY that.
 *
 * §9.1: never merge the "Recommended Prerequisite:" blocks — different field,
 * different meaning. Structurally they live in their own <div class=
 * "courseblockextra"><b>Recommended Prerequisite:</b>, never inside p.prereq,
 * so scoping to p.prereq excludes them by construction rather than by string
 * matching. Verified: 67 p.prereq on the CS page, 66 labelled "Required
 * Prerequisites:" + 1 singular "Required Prerequisite:" (CS 757), 0 containing
 * a "Recommended" label.
 *
 * Output format matches the two real strings quoted in §9.2 verbatim, because
 * build-prereqs.ts builds its few-shots against them:
 *   "Required Prerequisites: (CS 211^C or 211^XS) and (MATH 125^C or 125^XS)."
 * <sup>C</sup> becomes ^C so the grade codes survive into a flat string.
 */
function extractPrereqText($: cheerio.CheerioAPI, block: cheerio.Cheerio<never>): string {
  const $p = block.find("p.prereq").first();
  if ($p.length === 0) return "";

  const label = normalize($p.find("b").first().text());
  // Singular "Required Prerequisite:" is a real variant (CS 757). Anything else
  // is not a required-prereq block and must not be captured.
  if (!/^Required Prerequisites?:/i.test(label)) return "";

  const $c = $p.clone();
  // Superscripts are the grade codes (C, B-, XS) and the concurrency marker (*).
  $c.find("sup").each((_, s) => {
    $(s).replaceWith("^" + $(s).text());
  });
  // <br> separates the expression from the trailing legend lines.
  $c.find("br").each((_, b) => {
    $(b).replaceWith("\u0001");
  });

  const segs = normalize($c.text()).split("\u0001");
  const expr = segs[0].trim();

  // Drop the "^C Requires minimum grade of C." legend lines — §9.2's reference
  // strings stop at the expression. KEEP any other legend, because "^* May be
  // taken concurrently." (CS 262) is the only signal for PrereqRule.coreq and
  // discarding it would make that field permanently unfillable.
  const keptTails = segs
    .slice(1)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/Requires minimum grade of/i.test(s));

  return [expr, ...keptTails].join(" ").trim();
}

/**
 * Credits. Most are a plain integer, but 7 CS entries are ranges
 * (CS 498 "1-3", CS 998 "1-12", …). We take the HIGH end: §11.3 caps a combo at
 * targetCredits, so overstating a variable-credit independent study keeps it out
 * of an auto-generated schedule, while understating it would let one slip in
 * "for free". CS 800 Colloquium is genuinely 0 credits — reported as 0.
 */
function extractCredits(titleLine: string): number | null {
  const m = titleLine.match(
    /(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s+credits?\b/i,
  );
  if (!m) return null;
  return Number(m[2] ?? m[1]);
}

interface ParsedCourse extends Course {
  subject: string;
}

function parseSubject(subject: string, html: string): ParsedCourse[] {
  const $ = cheerio.load(html);
  const out: ParsedCourse[] = [];

  $("div.courseblock").each((_, el) => {
    const block = $(el) as unknown as cheerio.Cheerio<never>;

    // cb_code reads "CS 330:" — with U+00A0 and a trailing colon.
    const code = normalize(block.find(".cb_code").text()).replace(/:\s*$/, "");
    if (!code) return;

    const title = normalize(block.find(".cb_title").text()).replace(/\.\s*$/, "");
    const titleLine = normalize(block.find(".courseblocktitle").text());
    const credits = extractCredits(titleLine);
    if (credits === null) {
      console.warn(`  !! no credits parsed for ${code}: ${titleLine}`);
      return;
    }

    const description = normalize(block.find(".courseblockdesc").text());
    const prereqText = extractPrereqText($, block);

    // §9.1: capture p.maj only. Ignore p.deg and p.att.
    const majRaw = normalize(block.find("p.maj").first().text());
    const majorRestriction = majRaw.length > 0 ? majRaw : null;

    out.push({
      code,
      title,
      credits,
      description,
      prereqText,
      // Placeholders — scrape-sections.ts overwrites both from observed Banner
      // data. ["fall","spring"] is the §8-mandated default, never [], because []
      // silently deletes the course from §11.3's `eligible` set.
      termsOffered: ["fall", "spring"] as Term[],
      everyOtherYear: false, // §8: ALWAYS false. Never set true.
      majorRestriction,
      sections: [],
      subject,
    });
  });

  return out;
}

async function main() {
  console.log("scrape-catalog — GMU CourseLeaf (§9.1 Source A)\n");

  const all: ParsedCourse[] = [];
  for (const subject of SUBJECTS) {
    const html = await fetchSubject(subject);
    const courses = parseSubject(subject, html);
    console.log(`  ${subject.toUpperCase().padEnd(4)} → ${courses.length} courses`);
    all.push(...courses);
  }

  // Dedupe on code. Cross-listed courses can appear under two subjects; first
  // wins, and we say so out loud rather than silently emitting a duplicate key.
  const byCode = new Map<string, ParsedCourse>();
  for (const c of all) {
    const prev = byCode.get(c.code);
    if (prev) {
      console.warn(`  !! duplicate ${c.code} (${prev.subject} / ${c.subject}) — keeping first`);
      continue;
    }
    byCode.set(c.code, c);
  }

  // §8: code is canonical "DEPT NNN", single ASCII space. Assert it here rather
  // than discovering a bad key downstream in the prereq graph.
  const CODE_RE = /^[A-Z]{2,4} \d{3}$/;
  const bad = [...byCode.keys()].filter((c) => !CODE_RE.test(c));
  if (bad.length > 0) {
    console.warn(`\n  !! ${bad.length} codes do not match /^[A-Z]{2,4} \\d{3}$/:`);
    bad.forEach((c) => console.warn(`     ${JSON.stringify(c)}`));
  }

  const courses: Course[] = [...byCode.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    // strip the internal `subject` helper — it is not part of the §8 contract
    .map(({ subject: _subject, ...c }) => c);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(courses, null, 2) + "\n", "utf8");

  const withPrereq = courses.filter((c) => c.prereqText.length > 0).length;
  const withMaj = courses.filter((c) => c.majorRestriction).length;

  console.log(`\n  total courses      ${courses.length}`);
  console.log(`  with prereqText    ${withPrereq}`);
  console.log(`  with majorRestrict ${withMaj}`);
  console.log(`  bad codes          ${bad.length}`);
  console.log(`\n  wrote ${path.relative(REPO_ROOT, OUT_FILE)}`);

  if (courses.length === 0) {
    // The exact failure §9.1 warns about: nbsp normalization skipped → empty file.
    console.error("\n  FATAL: wrote an EMPTY catalog. Check the U+00A0 normalizer.");
    process.exit(1);
  }

  console.log("\n  NEXT: npx tsx scripts/scrape-sections.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
