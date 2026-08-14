// scrape-sections.ts — Source B of two (CLAUDE.md §9.1).
//
// Banner 8 self-service publishes CRNs, meeting times, instructors and modality.
// ✅ VERIFIED public: no login, no cookies, no session. Banner 9 (ssb.gmu.edu) is
// firewalled (403) and there is no public JSON API, so server-rendered Banner 8
// HTML is the only path. patriotweb.gmu.edu serves no robots.txt, so no path
// there is disallowed.
//
// RUN ORDER: scrape-catalog.ts must run FIRST. This script reads the courses it
// wrote, merges sections + observed termsOffered into them, and rewrites
// data/courses.json in place.
//
//   npx tsx scripts/scrape-catalog.ts
//   npx tsx scripts/scrape-sections.ts

import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";

import type { Course, Section, Term } from "@/lib/types";

const REPO_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache");
const COURSES_FILE = path.join(REPO_ROOT, "data", "courses.json");

const DELAY_MS = 500;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FORM_URL =
  "https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_dyn_sched/";
// The TRAILING SLASH is required (§9.1). Without it Banner 404s.
const SEARCH_URL =
  "https://patriotweb.gmu.edu/pls/prod/bwckschd.p_get_crse_unsec/";

const SUBJECTS = ["CS", "MATH", "STAT", "IT", "ENGH", "PHYS"] as const;

// §9.1: pull THREE terms in one run. Sections come from 202670 ONLY — that is the
// only registerable term. The other two exist solely to decide termsOffered:
// Fall 2025 is the same-season repeat that lets us distinguish a real fall-only
// policy from a one-off Spring cancellation.
const TERMS = [
  { code: "202670", label: "Fall 2026", season: "fall" as Term, isTarget: true },
  { code: "202610", label: "Spring 2026", season: "spring" as Term, isTarget: false },
  { code: "202570", label: "Fall 2025", season: "fall" as Term, isTarget: false },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function norm(s: string): string {
  // U+00A0 first, always (§9.1). Banner emits it for empty Days cells.
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The run of `dummy` sentinel values BEFORE the real ones is required — Banner
 * rejects the POST without it. Each sel_* key is submitted twice: once as
 * "dummy", once with the real value. This mirrors what the HTML form posts.
 */
function searchBody(termCode: string, subject: string): string {
  return (
    `term_in=${termCode}` +
    `&sel_subj=dummy&sel_day=dummy&sel_schd=dummy&sel_insm=dummy&sel_camp=dummy` +
    `&sel_levl=dummy&sel_sess=dummy&sel_instr=dummy&sel_ptrm=dummy&sel_attr=dummy` +
    `&sel_subj=${subject}&sel_crse=&sel_title=&sel_schd=%25&sel_insm=%25` +
    `&sel_from_cred=&sel_to_cred=&sel_camp=%25&sel_levl=%25&sel_ptrm=%25` +
    `&sel_instr=%25&sel_attr=%25` +
    `&begin_hh=0&begin_mi=0&begin_ap=a&end_hh=0&end_mi=0&end_ap=a`
  );
}

let formPrimed = false;

async function fetchTermSubject(
  termCode: string,
  subject: string,
): Promise<string> {
  const cacheFile = path.join(
    CACHE_DIR,
    `banner-${subject.toLowerCase()}-${termCode}.html`,
  );
  if (fs.existsSync(cacheFile)) {
    console.log(`  [cache] ${subject} ${termCode}`);
    return fs.readFileSync(cacheFile, "utf8");
  }

  // Hit the search form once per run, exactly as a browser would before posting.
  if (!formPrimed) {
    const g = await fetch(FORM_URL, { headers: { "User-Agent": USER_AGENT } });
    if (!g.ok) throw new Error(`form GET → HTTP ${g.status}`);
    formPrimed = true;
    await sleep(DELAY_MS);
  }

  console.log(`  [net]   POST ${subject} ${termCode}`);
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: FORM_URL,
    },
    body: searchBody(termCode, subject),
  });
  if (!res.ok) throw new Error(`${subject} ${termCode} → HTTP ${res.status}`);
  const html = await res.text();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, "utf8");
  await sleep(DELAY_MS);
  return html;
}

// ---------------------------------------------------------------------------
// Modality (§9.1)
// ---------------------------------------------------------------------------

// Banner emits percentage-band strings, not words. These four are ✅ VERIFIED
// against live Fall 2026 CS data; NOTHING in CS maps to "hybrid".
const MODALITY_MAP: Record<string, Section["modality"]> = {
  "On-campus F2F 76-100%": "in-person",
  "Wiley Off F2F 0-1% Async": "online",
  "Off-campus F2F 0-1% Async": "online",
  "Off-campus F2F 0-1% Sync": "online",
};

const unmappedModalities = new Map<string, number>();

const unresolvedModalities = new Map<string, number>();

/**
 * §9.1: "Log any unmapped modality string loudly rather than defaulting."
 *
 * We do log loudly — but we still have to emit one of the three frozen enum
 * values, so unknown strings are resolved by the F2F percentage band that is
 * literally encoded in the string itself. That is a reading of the data, not a
 * default. Every such string is tallied and printed at the end of the run.
 *
 * §9.1's four-string map was derived from CS, where nothing is hybrid. The other
 * five subjects add six more strings, and TWO of them state a single percentage
 * rather than a range — "On-campus F2F 50% Async" (113 sections),
 * "On-campus F2F 50% Sync" (21). A range-only regex misses those and silently
 * calls a 50%-in-person course fully in-person, which is exactly the wrong
 * answer for Preferences.inPersonOnly. Match one-or-two numbers.
 */
/** Pure: the §9.1 map, then the percentage band. `null` = nothing readable. */
function resolveModality(raw: string): Section["modality"] | null {
  const hit = MODALITY_MAP[raw];
  if (hit) return hit;

  const band = raw.match(/(\d+)\s*(?:-\s*(\d+))?\s*%/);
  if (!band) return null;
  const lo = Number(band[1]);
  const hi = band[2] === undefined ? lo : Number(band[2]);
  if (lo >= 76) return "in-person";
  if (hi <= 1) return "online";
  return "hybrid";
}

function mapModality(raw: string): Section["modality"] {
  if (MODALITY_MAP[raw]) return MODALITY_MAP[raw];
  unmappedModalities.set(raw, (unmappedModalities.get(raw) || 0) + 1);

  const resolved = resolveModality(raw);
  if (resolved) return resolved;

  // No percentage at all — nothing to read. Say so out loud too.
  unresolvedModalities.set(raw, (unresolvedModalities.get(raw) || 0) + 1);
  return "in-person";
}

// ---------------------------------------------------------------------------
// Time (§9.1)
// ---------------------------------------------------------------------------

const TIME_RE = /^(\d{1,2}):(\d{2})\s*([ap])m$/i;

/** "9:00 am" → "09:00", "1:15 pm" → "13:15", "12:30 am" → "00:30". */
function to24h(s: string): string | null {
  const m = s.trim().match(TIME_RE);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3].toLowerCase();
  if (ap === "a" && h === 12) h = 0;
  if (ap === "p" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface RawSection {
  crn: string;
  code: string; // "CS 330"
  sectionNumber: string; // "003", "2G1", "DL2"
  days: string;
  startTime: string;
  endTime: string;
  instructor: string;
  modality: Section["modality"];
  scheduleType: string;
}

const stats = {
  ddtitles: 0,
  droppedNonLecture: 0,
  droppedSection2: 0,
  async: 0,
  multiRealMeetingRows: 0,
  badCode: 0,
};

const scheduleTypeCensus = new Map<string, number>();

function parseTermSubject(html: string): RawSection[] {
  const $ = cheerio.load(html);
  const out: RawSection[] = [];

  $("th.ddtitle a").each((_, a) => {
    stats.ddtitles++;

    // "Formal Methods and Models - 77905 - CS 330 - 003". The TITLE itself can
    // contain " - ", so parse from the RIGHT, never by splitting and taking [0].
    const raw = norm($(a).text());
    const parts = raw.split(" - ");
    if (parts.length < 4) return;
    const sectionNumber = parts[parts.length - 1];
    const code = norm(parts[parts.length - 2]);
    const crn = parts[parts.length - 3];
    if (!/^\d+$/.test(crn)) return;
    if (!/^[A-Z]{2,4} \d{3}$/.test(code)) {
      stats.badCode++;
      return;
    }

    // The detail row is the <tr> immediately after the title's <tr>.
    const $body = $(a).closest("tr").next("tr");
    if ($body.length === 0) return;
    const $cell = $body.find("td").first();

    // Body is a flat run of <br>-separated lines. Splitting on <br> is the only
    // way to isolate the modality line — a regex over the concatenated text
    // greedily swallows the Attributes and Campus lines above it.
    const lines = ($cell.html() || "")
      .split(/<br\s*\/?>/i)
      .map((chunk) => norm(cheerio.load(`<div>${chunk}</div>`)("div").text()))
      .filter((l) => l.length > 0);

    const modalityLine = lines.find((l) => /\sInstructional Method$/.test(l));
    const modalityRaw = modalityLine
      ? modalityLine.replace(/\s*Instructional Method$/, "").trim()
      : "";
    const modality = mapModality(modalityRaw);

    // Meeting rows. Header row is index 0.
    const rows = $cell.find("table.datadisplaytable tr").slice(1);
    const meetings: {
      time: string;
      days: string;
      scheduleType: string;
      instructor: string;
    }[] = [];

    rows.each((__, tr) => {
      const tds = $(tr)
        .find("td")
        .map((___, td) => norm($(td).text()))
        .get();
      if (tds.length < 7) return;
      meetings.push({
        time: tds[1],
        days: tds[2],
        scheduleType: tds[5],
        instructor: tds[6],
      });
    });

    if (meetings.length === 0) return;

    // A handful of sections carry TWO meeting rows — CS 399 DL2 has one real
    // Monday block plus a TBA row. §5 closed "restructure Section into
    // Meeting[]", so we take the FIRST row with a real clock time and only fall
    // back to row 0 when none has one. Taking the last row would silently
    // convert that section to "asynchronous" and hide a real meeting time.
    const realRows = meetings.filter((m) => TIME_RE.test(m.time.split("-")[0].trim()));
    if (realRows.length > 1) stats.multiRealMeetingRows++;
    const meeting = realRows[0] ?? meetings[0];

    const scheduleType = meeting.scheduleType || "";
    scheduleTypeCensus.set(
      scheduleType,
      (scheduleTypeCensus.get(scheduleType) || 0) + 1,
    );

    // §9.1: drop non-lecture rows. This sidesteps lecture/lab pairing
    // combinatorics entirely and keeps §8's Section frozen.
    if (/^(Laboratory|Recitation)$/i.test(scheduleType)) {
      stats.droppedNonLecture++;
      return;
    }
    if (sectionNumber.startsWith("2")) {
      stats.droppedSection2++;
      return;
    }

    // §9.1: async sections carry Time="TBA" and Days="&nbsp;". Fix HERE, at parse
    // time, not in the conflict checker — otherwise "TBA" reaches the 12h→24h
    // converter and a schedule card renders "NaN:NaN".
    let days = "";
    let startTime = "";
    let endTime = "";
    const [rawStart, rawEnd] = meeting.time.split("-").map((s) => s.trim());
    const s24 = rawStart ? to24h(rawStart) : null;
    const e24 = rawEnd ? to24h(rawEnd) : null;
    if (s24 && e24) {
      days = meeting.days;
      startTime = s24;
      endTime = e24;
    } else {
      stats.async++;
    }

    // "Shahnaz Kamberi (P)" → "Shahnaz Kamberi". (P)/(S) are primary/secondary
    // markers, not part of the name, and lib/rmp.ts puts this straight into a
    // RateMyProfessors search query.
    const instructor =
      norm(meeting.instructor.replace(/\([A-Z]\)/g, "").replace(/,\s*$/, "")) ||
      "TBA";

    out.push({
      crn,
      code,
      sectionNumber,
      days,
      startTime,
      endTime,
      instructor,
      modality,
      scheduleType,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("scrape-sections — GMU Banner 8 (§9.1 Source B)\n");

  if (!fs.existsSync(COURSES_FILE)) {
    console.error(
      "FATAL: data/courses.json not found. Run scripts/scrape-catalog.ts first.",
    );
    process.exit(1);
  }
  const courses: Course[] = JSON.parse(fs.readFileSync(COURSES_FILE, "utf8"));
  console.log(`  loaded ${courses.length} courses from the catalog\n`);

  // termCode → set of course codes observed with a lecture section that term
  const observed = new Map<string, Set<string>>();
  // course code → sections, from the target term only
  const targetSections = new Map<string, Section[]>();

  for (const term of TERMS) {
    const seen = new Set<string>();
    let rawCount = 0;

    for (const subject of SUBJECTS) {
      const html = await fetchTermSubject(term.code, subject);

      // A wrong term code or a rejected POST still returns HTTP 200 with an
      // error page. Fail loudly instead of writing an empty termsOffered.
      const parsed = parseTermSubject(html);
      if (parsed.length === 0 && !/ddtitle/.test(html)) {
        throw new Error(
          `${subject} ${term.code} returned no section table — Banner likely rejected the POST body`,
        );
      }
      rawCount += parsed.length;

      for (const s of parsed) {
        seen.add(s.code);
        if (term.isTarget) {
          const list = targetSections.get(s.code) ?? [];
          list.push({
            crn: s.crn,
            days: s.days,
            startTime: s.startTime,
            endTime: s.endTime,
            instructor: s.instructor,
            modality: s.modality,
            term: term.season,
          });
          targetSections.set(s.code, list);
        }
      }
    }

    observed.set(term.code, seen);
    console.log(
      `  ${term.label.padEnd(11)} ${String(rawCount).padStart(4)} lecture sections across ${seen.size} distinct courses\n`,
    );
  }

  const inF26 = observed.get("202670")!;
  const inS26 = observed.get("202610")!;
  const inF25 = observed.get("202570")!;

  /**
   * §9.1: termsOffered is DERIVED FROM OBSERVATION, never from prose.
   *
   * Mark a course single-term only when the pattern REPEATS across the two
   * same-season samples — otherwise a one-off cancellation gets mislabelled as a
   * policy bottleneck, which is exactly the kind of false claim §11.1 would then
   * put on camera as "critical".
   *
   * fall-only   : present Fall 2025 AND Fall 2026, absent Spring 2026
   * spring-only : present Spring 2026, absent from BOTH fall samples
   * everything else, including "never observed", → ["fall","spring"] (§8 mandate:
   * NEVER [], because [] silently deletes the course from §11.3's `eligible`).
   *
   * "summer" is never emitted: we sample no summer term and §11.1 treats summer
   * as unplannable.
   */
  function deriveTerms(code: string): Term[] {
    const f26 = inF26.has(code);
    const s26 = inS26.has(code);
    const f25 = inF25.has(code);
    if (f26 && f25 && !s26) return ["fall"];
    if (s26 && !f26 && !f25) return ["spring"];
    return ["fall", "spring"];
  }

  let withSections = 0;
  let fallOnly = 0;
  let springOnly = 0;
  let neverObserved = 0;

  const merged: Course[] = courses.map((c) => {
    const sections = targetSections.get(c.code) ?? [];
    if (sections.length > 0) withSections++;
    if (!inF26.has(c.code) && !inS26.has(c.code) && !inF25.has(c.code))
      neverObserved++;

    const termsOffered = deriveTerms(c.code);
    if (termsOffered.length === 1 && termsOffered[0] === "fall") fallOnly++;
    if (termsOffered.length === 1 && termsOffered[0] === "spring") springOnly++;

    // Deterministic order so re-runs produce a stable diff.
    sections.sort((a, b) => a.crn.localeCompare(b.crn));

    return {
      ...c,
      termsOffered,
      everyOtherYear: false, // §8: ALWAYS false.
      sections,
    };
  });

  fs.writeFileSync(COURSES_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");

  // ---- report -------------------------------------------------------------

  console.log("---- schedule type census (all terms, before drop) ----");
  [...scheduleTypeCensus.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) =>
      console.log(`  ${String(v).padStart(5)}x  ${JSON.stringify(k)}`),
    );

  if (unmappedModalities.size > 0) {
    console.log(
      "\n  !!!! MODALITY STRINGS NOT IN THE §9.1 MAP — resolved by percentage band !!!!",
    );
    [...unmappedModalities.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) =>
        console.log(
          `  ${String(v).padStart(5)}x  ${JSON.stringify(k)} → ${resolveModality(k) ?? "UNRESOLVED"}`,
        ),
      );
  } else {
    console.log("\n  modality: every string matched the §9.1 map exactly");
  }
  if (unresolvedModalities.size > 0) {
    console.log("\n  !!!! MODALITY STRINGS WITH NO PERCENTAGE — GUESSED !!!!");
    [...unresolvedModalities.entries()].forEach(([k, v]) =>
      console.log(`  ${String(v).padStart(5)}x  ${JSON.stringify(k)}`),
    );
  }

  const modalityCensus = new Map<string, number>();
  for (const c of merged)
    for (const s of c.sections)
      modalityCensus.set(s.modality, (modalityCensus.get(s.modality) || 0) + 1);
  console.log("\n---- Fall 2026 written-section modality ----");
  [...modalityCensus.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}x  ${k}`));

  const totalSections = merged.reduce((n, c) => n + c.sections.length, 0);
  console.log("\n---- merge result ----");
  console.log(`  ddtitle rows seen          ${stats.ddtitles}`);
  console.log(`  dropped Laboratory/Recit.  ${stats.droppedNonLecture}`);
  console.log(`  dropped section starting 2 ${stats.droppedSection2}`);
  console.log(`  async sections (TBA time)  ${stats.async}`);
  console.log(`  sections w/ >1 timed row   ${stats.multiRealMeetingRows}`);
  console.log(`  unparseable course codes   ${stats.badCode}`);
  console.log(`  courses total              ${merged.length}`);
  console.log(`  courses with >=1 section   ${withSections}`);
  console.log(`  Fall 2026 sections written ${totalSections}`);
  console.log(`  termsOffered ["fall"]      ${fallOnly}`);
  console.log(`  termsOffered ["spring"]    ${springOnly}`);
  console.log(`  never observed (defaulted) ${neverObserved}`);
  console.log(`\n  wrote ${path.relative(REPO_ROOT, COURSES_FILE)}`);

  if (merged.every((c) => c.sections.length === 0)) {
    console.error("\n  FATAL: no sections merged. Banner parse is broken.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
