// Reverse Audit — §11.2 skill-gap computation.
//
// Pure, synchronous, no I/O. §6 computes this client-side from
// `catalog-skills.json` + the extracted job skills + the parsed audit.

import {
  electiveLevelOk,
  isUndergraduate,
  normalizeCode,
  prereqsSatisfied,
  remainingRequired,
} from "@/lib/bottlenecks";
import type {
  CatalogSkills,
  Course,
  PrereqGraph,
  SkillGap,
  StudentAudit,
} from "@/lib/types";

/**
 * One skill as `POST /api/extract-skills` returns it (§12.2).
 *
 * `postings` holds the INDICES of the pasted postings that asked for this
 * skill. §18 finding 4: without it `keeps-options-open` has no input at all and
 * silently renders a duplicate of `max-coverage`. It is optional here only so
 * that a caller holding a plain `Skill` + count can still call this function.
 *
 * Declared locally on purpose — §12.3: wire types do not go in `lib/types.ts`.
 */
export interface DemandedSkill {
  skillId: string;
  skillName: string;
  demandCount: number;
  postings?: number[];
}

/**
 * `SkillGap` (frozen, §8) carrying the posting membership forward.
 *
 * Structurally still a `SkillGap`, so this is assignable anywhere a `SkillGap`
 * is expected — the extra field costs the UI nothing and is what lets
 * `lib/schedules.ts` score `keeps-options-open` without a second API payload.
 */
export type SkillGapWithPostings = SkillGap & { postings: number[] };

/** course code → the skills that course teaches, with the match score. */
type SkillIndex = Map<string, { code: string; score: number }[]>;

function buildSkillIndex(catalogSkills: CatalogSkills, valid: ReadonlySet<string>): SkillIndex {
  const index: SkillIndex = new Map();
  for (const [rawCode, taught] of Object.entries(catalogSkills)) {
    const code = normalizeCode(rawCode);
    // A skills entry for a course that is not in the catalog would put a
    // phantom code into `closableBy`, i.e. onto a chip in front of a judge.
    if (!valid.has(code)) continue;
    for (const entry of taught ?? []) {
      const skillId = entry?.skillId;
      if (!skillId) continue;
      const list = index.get(skillId);
      const row = { code, score: typeof entry.score === "number" ? entry.score : 0 };
      if (list) list.push(row);
      else index.set(skillId, [row]);
    }
  }
  // Strongest match first, then alphabetical — deterministic order for the UI.
  for (const list of index.values()) {
    list.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  }
  return index;
}

/**
 * Merge duplicate skill ids coming back from the extractor.
 *
 * The model processes each posting separately (§12.2), so the same DWA can
 * legitimately arrive more than once. `demandCount` is a cardinality over
 * postings, so the merge takes the MAX rather than the sum — summing would
 * report "wanted by 6 of your 3 postings".
 */
function mergeDemanded(demanded: DemandedSkill[]): DemandedSkill[] {
  const merged = new Map<string, DemandedSkill & { postings: number[] }>();
  for (const skill of demanded) {
    if (!skill?.skillId) continue;
    const seen = merged.get(skill.skillId);
    const postings = (skill.postings ?? []).filter((n) => Number.isInteger(n));
    if (!seen) {
      merged.set(skill.skillId, {
        skillId: skill.skillId,
        skillName: skill.skillName ?? skill.skillId,
        demandCount: Math.max(0, skill.demandCount ?? 0),
        postings: [...new Set(postings)],
      });
      continue;
    }
    seen.demandCount = Math.max(seen.demandCount, skill.demandCount ?? 0);
    seen.postings = [...new Set([...seen.postings, ...postings])];
  }
  return [...merged.values()];
}

/**
 * §11.2.
 *
 * Emits a `SkillGap` for EVERY demanded skill, covered and not. It is NOT a set
 * difference — §18 finding 5: returning only `demanded − alreadyCovered` made
 * `covered` permanently false and `coveredBy` permanently empty, which left
 * §13's two-colour chip map with no data for its first colour. The type was
 * right and the algorithm was wrong.
 *
 * "Covered" deliberately includes courses the student has NOT taken yet but
 * still MUST take. That is the useful message: you are already getting this,
 * do not spend an elective on it.
 */
export function computeSkillGaps(
  demanded: DemandedSkill[],
  audit: StudentAudit,
  catalogSkills: CatalogSkills,
  prereqs: PrereqGraph,
  courses: Course[],
): SkillGapWithPostings[] {
  const validCodes = new Set(courses.map((c) => normalizeCode(c.code)));
  const index = buildSkillIndex(catalogSkills, validCodes);

  // Step 2 — (a) already taken plus (b) still-required. They are locked in
  // either way, so both count as covering.
  const taken = new Set(audit.coursesTaken.map(normalizeCode));
  const stillRequired = new Set(remainingRequired(audit));
  const lockedIn = new Set([...taken, ...stillRequired]);

  const gaps: SkillGapWithPostings[] = mergeDemanded(demanded).map((skill) => {
    const teachers = index.get(skill.skillId) ?? [];

    // Step 3 — coveredBy over (a)+(b).
    const coveredBy = teachers.filter((t) => lockedIn.has(t.code)).map((t) => t.code);
    const covered = coveredBy.length > 0;

    // Step 4 — closableBy is computed ONLY where the skill is not covered.
    // Sorted by match score (buildSkillIndex already did that), so a UI that
    // shows the first two or three chips shows the best two or three. No cap
    // here: truncating is a rendering decision, not an algorithm decision.
    const closableBy = covered
      ? []
      : teachers
          .filter(
            (t) =>
              !taken.has(t.code) &&
              // See `isUndergraduate` — without it the chips offer PHYS 695 to
              // a CS junior. `electiveLevelOk` is the mirror at the other end:
              // closableBy is by definition an ELECTIVE suggestion (the skill is
              // not covered by anything required), so a 100-level course here
              // reads exactly as wrong as a 600-level one.
              isUndergraduate(t.code) &&
              electiveLevelOk(t.code, audit) &&
              // §13: "prereq courses completed", never "all prereqs met" —
              // `prereqsSatisfied` cannot see grades.
              prereqsSatisfied(t.code, prereqs, taken),
          )
          .map((t) => t.code);

    return {
      skillId: skill.skillId,
      skillName: skill.skillName,
      demandCount: skill.demandCount,
      coveredBy,
      covered,
      closableBy,
      postings: skill.postings ?? [],
    };
  });

  // Step 5 — covered ascending (the gaps first, because those are the ones a
  // schedule can act on), then demandCount descending. §13's chip map reads
  // this order straight off the array. skillName is the final tiebreak so the
  // same input always renders the same chip order.
  gaps.sort(
    (a, b) =>
      Number(a.covered) - Number(b.covered) ||
      b.demandCount - a.demandCount ||
      a.skillName.localeCompare(b.skillName),
  );

  return gaps;
}
