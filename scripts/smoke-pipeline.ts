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

import { computeBottlenecks } from "../lib/bottlenecks";
import { computeSkillGaps, type DemandedSkill } from "../lib/gaps";
import {
  buildSchedules,
  getEligibleCourses,
  unofferedCriticals,
} from "../lib/schedules";
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
const unoffered = unofferedCriticals(bottlenecks, eligible);
console.log("\n§11.3 schedules");
check("eligible set is non-empty", eligible.size > 0, `${eligible.size} eligible courses next term`);

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
if (unoffered.length > 0) console.log(`\n  not offered next term: ${unoffered.join(", ")}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
