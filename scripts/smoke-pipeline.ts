/**
 * End-to-end smoke test of the CLIENT pipeline, run offline.
 *
 * app/page.tsx does exactly this sequence in the browser: parse an audit, then
 * computeBottlenecks + computeSkillGaps locally (§11.1/§11.2), then
 * buildSchedules (§11.3), then POST the combos for prose. This script runs the
 * same calls against the committed data so a regression in any of the three
 * algorithms fails here rather than on camera.
 *
 * Run:  npx tsx scripts/smoke-pipeline.ts
 * Exits non-zero if the demo path would render an empty or degenerate screen.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeBottlenecks, delayImpact } from "../lib/bottlenecks";
import { computeSkillGaps, type DemandedSkill } from "../lib/gaps";
import {
  buildSchedules,
  explainIneligibility,
  getEligibleCourses,
  ineligibleCriticals,
} from "../lib/schedules";
import { normalizeCode } from "../lib/bottlenecks";
import { NEXT_TERM } from "../lib/types";
import type {
  CatalogSkills,
  Course,
  Preferences,
  PrereqGraph,
  StudentAudit,
} from "../lib/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = <T,>(p: string): T => JSON.parse(readFileSync(path.join(root, p), "utf8")) as T;

const courses = read<Course[]>("data/courses.json");
const prereqs = read<PrereqGraph>("data/prereqs.json");
const catalogSkills = read<CatalogSkills>("data/catalog-skills.json");
const fixture = read<{
  "parse-audit": { audit: StudentAudit };
  "extract-skills": { skills: DemandedSkill[] };
}>("samples/fallback-response.json");

const audit = fixture["parse-audit"].audit;
const demanded = fixture["extract-skills"].skills;

const prefs: Preferences = {
  lighterWorkload: false,
  noMornings: false,
  inPersonOnly: false,
};

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
};

console.log(`\ncatalog: ${courses.length} courses · ${Object.keys(prereqs).length} prereq rules · ${Object.keys(catalogSkills).length} skill maps`);
console.log(`student: ${audit.major}, ${audit.creditsCompleted}/${audit.creditsRequired} cr, grad ${audit.expectedGraduation}\n`);

// --- §11.1 -----------------------------------------------------------------
const bottlenecks = computeBottlenecks(audit, prereqs, courses);
const byUrgency = {
  critical: bottlenecks.filter((b) => b.urgency === "critical"),
  soon: bottlenecks.filter((b) => b.urgency === "soon"),
  flexible: bottlenecks.filter((b) => b.urgency === "flexible"),
};
console.log("§11.1 bottlenecks");
check(
  "produces rows",
  bottlenecks.length > 0,
  `${bottlenecks.length} rows (${byUrgency.critical.length} critical / ${byUrgency.soon.length} soon / ${byUrgency.flexible.length} flexible)`,
);
check(
  "at least one critical drives the story",
  byUrgency.critical.length >= 1,
  byUrgency.critical.map((b) => `${b.code} depth=${b.chainDepth} deps=${b.dependents.length}`).join(", ") || "none",
);
check(
  "dependents.length >= chainDepth for every row",
  bottlenecks.every((b) => b.dependents.length >= b.chainDepth),
  "invariant from §11.1",
);
check(
  "termsRemaining is a positive integer",
  bottlenecks.every((b) => Number.isInteger(b.termsRemaining) && b.termsRemaining >= 1),
  `${bottlenecks[0]?.termsRemaining ?? "n/a"} terms`,
);
check(
  "reason strings carry no NaN",
  bottlenecks.every((b) => !b.reason.includes("NaN")),
  bottlenecks[0]?.reason ?? "n/a",
);

// The upstream half. §11.1 used to reason downstream only, which put a course
// with an unmet prerequisite under a heading offering to take it this term.
const blocked = bottlenecks.filter((b) => b.blockedBy.length > 0);
check(
  "blockedBy and termsUntilEligible agree",
  bottlenecks.every((b) => (b.blockedBy.length > 0) === (b.termsUntilEligible > 0)),
  `${blocked.length} of ${bottlenecks.length} rows are blocked`,
);
check(
  "no blocker is a course already taken",
  bottlenecks.every((b) => b.blockedBy.every((c) => !audit.coursesTaken.includes(c))),
  blocked.map((b) => `${b.code} needs ${b.blockedBy.join("+")}`).join(", ") || "none",
);
check(
  // The defect this all exists for: the diagnosis screen partitions on
  // blockedBy first, so anything reaching a "take this term" heading must be
  // registrable next term.
  "every actionable row is registrable next term",
  bottlenecks
    .filter((b) => b.blockedBy.length === 0)
    .every((b) => b.termsUntilEligible === 0),
  `${bottlenecks.length - blocked.length} actionable rows carry no unmet prereq`,
);
check(
  "a blocked row is never ranked below a course it is waiting on",
  blocked.every((b) => {
    const blocker = bottlenecks.find((x) => b.blockedBy.includes(x.code));
    return !blocker || blocker.termsUntilEligible < b.termsUntilEligible;
  }),
  "the course that unblocks it is always closer to takeable",
);

// --- §11.1, cost of delay --------------------------------------------------
// The "What if you take it later?" panel on a critical BottleneckCard. Its
// arithmetic has to stay consistent with the urgency label sitting right above
// it, or the card argues with itself in front of a registrar.
const delays = bottlenecks.map((b) => ({ b, d: delayImpact(b.code, audit, prereqs) }));
check(
  // Was chainDepth + 1. The head course now lands in term 1 + termsUntilEligible
  // rather than always next term, so the whole walk is offset by the chain
  // standing IN FRONT of it as well as the one behind.
  "termsNeeded is chainDepth + termsUntilEligible + 1 for every row",
  delays.every(({ b, d }) => d.termsNeeded === b.chainDepth + b.termsUntilEligible + 1),
  "the distance map and longestChain agree on depth",
);
check(
  "delayImpact and computeBottlenecks agree on termsUntilEligible",
  delays.every(({ b, d }) => d.termsUntilEligible === b.termsUntilEligible),
  "the panel and the card cannot disagree about when a course opens up",
);
check(
  "atRisk and beyondWindowNow are subsets of dependents",
  delays.every(({ b, d }) =>
    [...d.atRisk, ...d.beyondWindowNow].every((c) => b.dependents.includes(c)),
  ),
  "no invented course on the delay panel",
);
check(
  "atRisk and beyondWindowNow are disjoint",
  delays.every(({ d }) => d.atRisk.every((c) => !d.beyondWindowNow.includes(c))),
  "a course is never both 'breaks if you delay' and 'already unreachable'",
);
check(
  "flexible rows have nothing at risk",
  delays
    .filter(({ b }) => b.urgency === "flexible")
    .every(({ d }) => d.atRisk.length === 0 && d.beyondWindowNow.length === 0),
  "delay panel only appears where urgency is in question",
);
check(
  "at least one urgent row shows a real cost of delay",
  delays.some(({ b, d }) => b.urgency !== "flexible" && d.atRisk.length > 0),
  delays
    .filter(({ d }) => d.atRisk.length > 0 || d.beyondWindowNow.length > 0)
    .map(
      ({ b, d }) =>
        `${b.code} needs ${d.termsNeeded}/has ${d.termsAvailable}: delay risks [${d.atRisk.join(" ") || "-"}], already past [${d.beyondWindowNow.join(" ") || "-"}]`,
    )
    .join(" · ") || "none — the panel would never render",
);

// --- §11.2 -----------------------------------------------------------------
const gaps = computeSkillGaps(demanded, audit, catalogSkills, prereqs, courses);
const covered = gaps.filter((g) => g.covered);
const open = gaps.filter((g) => !g.covered);
console.log("\n§11.2 skill gaps");
check("emits every demanded skill", gaps.length === demanded.length, `${gaps.length} of ${demanded.length} demanded`);
check(
  "both chip colors have data",
  covered.length > 0 && open.length > 0,
  `${covered.length} covered / ${open.length} missing`,
);
check(
  "uncovered gaps are closable by something",
  open.some((g) => g.closableBy.length > 0),
  `${open.filter((g) => g.closableBy.length > 0).length} of ${open.length} have a closer`,
);

// --- §11.3 -----------------------------------------------------------------
const eligible = getEligibleCourses(audit, prefs, courses, prereqs);
const rejected = explainIneligibility(audit, prefs, courses, prereqs);
// Unblocked criticals only — the same filter app/page.tsx applies. A
// prereq-blocked course also misses `eligible`, but the "Can't take yet" group
// on the diagnosis screen already explains those.
const unoffered = ineligibleCriticals(
  bottlenecks.filter((b) => b.blockedBy.length === 0),
  rejected,
);
console.log("\n§11.3 schedules");
check("eligible set is non-empty", eligible.size > 0, `${eligible.size} eligible courses next term`);

// The two maps are the two halves of ONE pass, so they must partition the
// catalog minus the courses she has already taken. This is the drift guard on
// splitting getEligibleCourses into a classifier with two exported views.
{
  const taken = new Set(audit.coursesTaken.map(normalizeCode));
  const all = new Set(courses.map((c) => normalizeCode(c.code)));
  const accounted = new Set([...eligible.keys(), ...rejected.keys()]);
  const overlap = [...eligible.keys()].filter((code) => rejected.has(code));
  const missing = [...all].filter((code) => !taken.has(code) && !accounted.has(code));
  check(
    "eligible and rejected are disjoint",
    overlap.length === 0,
    overlap.length === 0 ? "no course is both" : overlap.join(", "),
  );
  check(
    "every untaken course is accounted for",
    missing.length === 0,
    `${eligible.size} eligible + ${rejected.size} rejected covers ${all.size - taken.size} untaken`,
  );
}

// THE REGRESSION TEST for the red banner. Every reported critical must carry a
// reason the banner can render, and a "no-section" claim has to be true against
// data/courses.json — that is exactly what the old single-sentence banner got
// wrong for major-restricted and graduate-level courses.
{
  const sectionsOf = new Map(
    courses.map((c) => [
      normalizeCode(c.code),
      (c.sections ?? []).filter((s) => s.term === NEXT_TERM).length,
    ]),
  );
  const liars = unoffered.filter(
    (e) => e.reason === "no-section" && (sectionsOf.get(e.code) ?? 0) > 0,
  );
  check(
    "every ineligible critical carries a reason",
    unoffered.every((e) => typeof e.reason === "string" && e.reason.length > 0),
    unoffered.map((e) => `${e.code}=${e.reason}`).join(", ") || "none reported",
  );
  check(
    "no 'no-section' claim contradicts the catalog",
    liars.length === 0,
    liars.length === 0
      ? "checked against data/courses.json"
      : liars.map((e) => `${e.code} has ${sectionsOf.get(e.code)} sections`).join(", "),
  );
}

// The reported defect, reproduced as a permanent case.
//
// `majorAllows` substring-matches the catalog's restriction prose, and manual
// entry takes the major as free text (AuditUpload.tsx), so "CS" fails where
// "Computer Science" passes. Tightening the graduation date promotes the `soon`
// rows to `critical`, which is what puts a major-restricted course into the red
// banner at all. Before per-course reasons, that banner asserted CS 330 had no
// Fall 2026 section. It has three (§9.1: CRNs 77905/77906/80167) — a claim a
// registrar disproves from Patriot Web in 30 seconds, §0 rule 7.
{
  const shorthand: StudentAudit = { ...audit, major: "CS", expectedGraduation: "2026-12" };
  const shorthandRejected = explainIneligibility(shorthand, prefs, courses, prereqs);
  const banner = ineligibleCriticals(
    computeBottlenecks(shorthand, prereqs, courses).filter((b) => b.blockedBy.length === 0),
    shorthandRejected,
  );
  const sectionsOf = new Map(
    courses.map((c) => [
      normalizeCode(c.code),
      (c.sections ?? []).filter((s) => s.term === NEXT_TERM).length,
    ]),
  );
  const restricted = banner.filter((e) => e.reason === "major-restricted");
  check(
    "an unmatched major reaches the banner as a restriction, not as a missing section",
    restricted.length > 0 && banner.every((e) => e.reason !== "no-section"),
    banner.map((e) => `${e.code}=${e.reason}`).join(", ") || "banner empty",
  );
  check(
    "and those courses do have live sections",
    restricted.every((e) => (sectionsOf.get(e.code) ?? 0) > 0),
    restricted.map((e) => `${e.code}:${sectionsOf.get(e.code)}`).join(", "),
  );
}

for (const variant of [
  { name: "default", prefs },
  { name: "lighterWorkload", prefs: { ...prefs, lighterWorkload: true } },
  { name: "noMornings", prefs: { ...prefs, noMornings: true } },
  { name: "inPersonOnly", prefs: { ...prefs, inPersonOnly: true } },
]) {
  const combos = buildSchedules(audit, variant.prefs, gaps, bottlenecks, courses, prereqs, catalogSkills);
  const sizes = combos.map((c) => `${c.strategy}:${c.courses.length}c/${c.totalCredits}cr`).join(" · ");
  check(`[${variant.name}] renders cards`, combos.length > 0, `${combos.length} cards — ${sizes}`);
  check(
    `[${variant.name}] no card is degenerate`,
    combos.every((c) => c.courses.length >= 2),
    combos.map((c) => `${c.strategy}=${c.courses.length}`).join(", "),
  );
  check(
    `[${variant.name}] cards are distinct`,
    new Set(combos.map((c) => c.courses.map((x) => x.code).sort().join("|"))).size === combos.length,
    "no duplicate course sets",
  );
  check(
    `[${variant.name}] every row has a real CRN and no conflicts`,
    combos.every((c) => c.conflicts.length === 0 && c.courses.every((r) => /^\d{4,6}$/.test(r.section.crn))),
    "CRNs well-formed",
  );
  if (variant.name === "noMornings") {
    check(
      "[noMornings] honours the 10:00 rule",
      combos.every((c) =>
        c.courses.every((r) => r.section.startTime === "" || r.section.startTime >= "10:00"),
      ),
      "no section starts before 10:00",
    );
  }
  if (variant.name === "inPersonOnly") {
    check(
      "[inPersonOnly] honours modality",
      combos.every((c) => c.courses.every((r) => r.section.modality === "in-person")),
      "all sections in-person",
    );
  }
}

const base = buildSchedules(audit, prefs, gaps, bottlenecks, courses, prereqs, catalogSkills);
console.log("\nwhat the options screen would show:");
for (const c of base) {
  console.log(`  ${c.strategy} — ${c.totalCredits}cr · clears ${c.bottlenecksCleared} · closes ${c.gapsClosed}/${c.gapsTotal} · ${c.slotsUsed} slots`);
  for (const r of c.courses) {
    const when = r.section.days ? `${r.section.days} ${r.section.startTime}` : "async";
    console.log(`      ${r.code.padEnd(9)} ${r.title.slice(0, 42).padEnd(43)} ${when.padEnd(10)} CRN ${r.section.crn}${r.isBottleneck ? "  [blocker]" : ""}`);
  }
}
if (unoffered.length > 0) {
  console.log(
    `\n  can't reach a card: ${unoffered.map((e) => `${e.code} (${e.reason})`).join(", ")}`,
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
