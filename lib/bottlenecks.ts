// Reverse Audit — §11.1 bottleneck detection.
//
// Pure, synchronous, no I/O. §6 runs this CLIENT-SIDE off `prereqs.json` +
// the parsed audit, so every loop in here has to terminate on data we did not
// author. See the `visiting` guard in `longestChain`.
//
// This file sits at the bottom of the lib dependency chain
// (bottlenecks → gaps → schedules) and therefore owns the three primitives all
// three algorithms share: `normalizeCode`, `remainingRequired` and
// `prereqsSatisfied`. Duplicating any of them would let §11.2 step 4 and §11.3
// step 1 disagree, i.e. let the gap map promise a course the schedule builder
// then refuses to offer.

import type {
  Bottleneck,
  Course,
  PrereqGraph,
  StudentAudit,
  Term,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Canonical "DEPT NNN" form, single ASCII space, upper case.
 *
 * §9.1: GMU's catalog puts U+00A0 between subject and number, and the scraper
 * normalizes on write — but `coursesTaken` arrives from an OpenAI parse of a
 * PDF (§12.1) and PDF text extraction re-introduces both the nbsp and stray
 * double spaces. Normalizing on every read is three characters of cost and
 * removes an entire class of silent "course not found" behaviour.
 */
export function normalizeCode(code: string): string {
  return code
    .replace(/\u00A0/g, " ") // §9.1: GMU uses U+00A0 between subject and number
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** "CS 484" → 484. Returns 0 when the code is not "DEPT NNN". */
export function courseNumber(code: string): number {
  const m = /(\d{3})\s*$/.exec(code);
  return m ? Number(m[1]) : 0;
}

/**
 * GMU's course-numbering system: 100–499 undergraduate, 500+ graduate.
 *
 * *** THE ONE ADDITION TO THE SPEC'S FILTER LISTS. ***  §11.3 step 1 and §11.2
 * step 4 do not mention course level, and the committed catalog contains 321
 * courses numbered 500 or above — 111 of them with a live Fall 2026 section and
 * 92 with NO prereq rule at all, which makes them trivially "eligible". They
 * also carry long, technical descriptions, so §9.4's embedding ranks them HIGH
 * on gapValue: without this line, CS 692 "Special Topics in Systems and
 * Networks" lands on an undergraduate's schedule card with a real CRN, and
 * "PHYS 695" lands on a gap-map chip.
 *
 * Graduate standing is a registration restriction exactly like
 * `majorRestriction` — the difference is that the catalog encodes it in the
 * NUMBER rather than in `p.maj`. §0 rule 7: a wrong domain claim in front of
 * registrars is worse than a bug, and a judge can check a CRN in 30 seconds.
 *
 * To revert to the literal spec, delete the two call sites (one in
 * `lib/schedules.ts` `getEligibleCourses`, one in `lib/gaps.ts` `closableBy`).
 */
export const GRADUATE_LEVEL = 500;

export function isUndergraduate(code: string): boolean {
  const n = courseNumber(code);
  // A code we could not parse is NOT excluded — see §0 rule 3.
  return n === 0 || n < GRADUATE_LEVEL;
}

/**
 * Is `code` a defensible ELECTIVE suggestion for this student?
 *
 * A student past junior standing should not be told to spend a scarce elective
 * slot on a lower-division course. Real embeddings surfaced this the moment they
 * replaced the lexical map: MATH 106 "Quantitative Reasoning" and STAT 260
 * "Introduction to Statistical Practice I" landed on the schedule card of a
 * student who had already completed MATH 213 and STAT 344, and IT 209
 * "Introduction to Object Oriented Programming" landed next to CS 484 for a
 * student who had finished CS 211. Every one of those is legal, registerable,
 * and obviously wrong to anyone who advises students — precisely the §0 rule 7
 * failure that costs more than a bug would.
 *
 * The rule mirrors ordinary advising practice (degrees carry an upper-division
 * credit minimum), and it applies ONLY to electives: a still-required course is
 * exempt at any level, which is what keeps 200-level CS 262 on the card.
 */
export const UPPER_DIVISION = 300;
export const JUNIOR_STANDING_CREDITS = 60;

export function electiveLevelOk(code: string, audit: StudentAudit): boolean {
  if (audit.creditsCompleted < JUNIOR_STANDING_CREDITS) return true;
  const n = courseNumber(code);
  return n === 0 || n >= UPPER_DIVISION;
}

/**
 * §11.1 step 1 — the union of `requirement.missing` across INCOMPLETE
 * requirements, minus anything the audit also lists as taken.
 *
 * The subtraction is defensive: a DegreeWorks parse that lists a course in both
 * places would otherwise produce a bottleneck for a course the student already
 * has, which reads as a broken product rather than as a parse artifact.
 */
export function remainingRequired(audit: StudentAudit): string[] {
  const taken = new Set(audit.coursesTaken.map(normalizeCode));
  const out = new Set<string>();
  for (const req of audit.requirements) {
    if (req.status !== "incomplete") continue;
    for (const missing of req.missing ?? []) {
      const code = normalizeCode(missing);
      if (code && !taken.has(code)) out.add(code);
    }
  }
  return [...out];
}

/**
 * Does `coursesTaken` satisfy this course's prerequisite rule?
 *
 * `minGrade` is deliberately ignored: §8 and §13 — `StudentAudit.coursesTaken`
 * carries no grades, so the strongest TRUE claim is "prereq courses completed".
 * The UI must never say "all prereqs met".
 *
 * `coreq` is deliberately NOT checked here. A corequisite is satisfiable by
 * taking it in the SAME term, so it is a constraint on the combo (§11.3 step 1
 * and step 5), not on the course.
 */
export function prereqsSatisfied(
  code: string,
  prereqs: PrereqGraph,
  taken: ReadonlySet<string>,
): boolean {
  const rule = prereqs[normalizeCode(code)];
  if (!rule) return true; // no rule in the graph == no prerequisites

  for (const req of rule.allOf ?? []) {
    if (!taken.has(normalizeCode(req))) return false;
  }
  for (const group of rule.oneOf ?? []) {
    // An empty group is a parse artifact, not an unsatisfiable requirement.
    if (!group.length) continue;
    if (!group.some((opt) => taken.has(normalizeCode(opt)))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// termsRemaining
// ---------------------------------------------------------------------------

const GRADUATION_PATTERN = /^(\d{4})-(\d{2})$/;

/** Month-since-year-0 index, so term arithmetic is integer comparison. */
function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

// A fall term is plannable up to and including August (registration is still
// open — §8 notes GMU's Fall 2026 window runs Apr 14 – Aug 31) and ends in
// December. A spring term is plannable through January and ends in May.
// SUMMER IS NEVER PLANNABLE (§11.1) so it is not in this table at all.
const PLANNABLE_TERMS: { season: Term; lastMonthToAdd: number; endMonth: number }[] = [
  { season: "spring", lastMonthToAdd: 1, endMonth: 5 },
  { season: "fall", lastMonthToAdd: 8, endMonth: 12 },
];

/**
 * §11.1 — the integer count of FALL AND SPRING terms strictly between now and
 * `expectedGraduation`, floored at 1.
 *
 * This was `months / 4` in the first draft of the spec. That counted summer as
 * plannable, overstated the runway by ~33%, and rendered "2.25 terms left"
 * straight onto a bottleneck card.
 *
 * A term counts when (a) it can still be added — its add cutoff is at or after
 * the current month — and (b) it finishes on or before the graduation month, so
 * the graduating term itself counts and nothing past it does.
 *
 * With no `expectedGraduation` (the field is nullable precisely so Structured
 * Outputs is not forced to invent one — §18 finding 3) we fall back to the
 * credit-pace estimate from §8.
 */
export function termsRemaining(audit: StudentAudit, now: Date = new Date()): number {
  const match = audit.expectedGraduation
    ? GRADUATION_PATTERN.exec(audit.expectedGraduation)
    : null;

  if (!match) {
    const left = audit.creditsRequired - audit.creditsCompleted;
    if (!Number.isFinite(left)) return 1;
    return Math.max(1, Math.ceil(left / 15));
  }

  const gradYear = Number(match[1]);
  const gradMonth = Number(match[2]);
  if (!Number.isFinite(gradYear) || gradMonth < 1 || gradMonth > 12) return 1;

  const gradIdx = monthIndex(gradYear, gradMonth);
  const nowIdx = monthIndex(now.getFullYear(), now.getMonth() + 1);

  let count = 0;
  for (let year = now.getFullYear(); year <= gradYear; year++) {
    for (const term of PLANNABLE_TERMS) {
      if (monthIndex(year, term.lastMonthToAdd) < nowIdx) continue;
      if (monthIndex(year, term.endMonth) > gradIdx) continue;
      count++;
    }
  }
  return Math.max(1, count);
}

// ---------------------------------------------------------------------------
// The reverse graph, restricted to remainingRequired
// ---------------------------------------------------------------------------

/**
 * §11.1 — "Define the graph once." BOTH `chainDepth` and `dependents` are read
 * off this one structure: the reverse prereq graph RESTRICTED to the courses
 * the student still needs. Computing them over two different graphs is what
 * produces "8 courses depend on it" under a SAFE TO DELAY heading.
 *
 * Edge c → d means "d lists c as a prerequisite". `oneOf` alternatives are
 * edges too: if the student still needs both, c really does gate d for them.
 * `coreq` is not an edge — a corequisite adds no term to the chain.
 */
function buildReverseGraph(
  scope: ReadonlySet<string>,
  prereqs: PrereqGraph,
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const code of scope) adj.set(code, []);

  for (const code of scope) {
    const rule = prereqs[code];
    if (!rule) continue;

    // Dedupe: §9.2 notes "CS 211^C or 211^XS" is ONE course with two credit
    // paths, so the same code can legitimately appear more than once in a rule.
    const seen = new Set<string>();
    for (const req of rule.allOf ?? []) seen.add(normalizeCode(req));
    for (const group of rule.oneOf ?? []) {
      for (const opt of group) seen.add(normalizeCode(opt));
    }

    for (const prereq of seen) {
      if (prereq === code) continue; // self-loop in bad data
      const edges = adj.get(prereq);
      if (edges) edges.push(code);
    }
  }

  for (const edges of adj.values()) edges.sort();
  return adj;
}

/**
 * Longest path from `node`, measured IN EDGES — a leaf is 0.
 *
 * The `visiting` guard is load-bearing, not belt-and-braces. A memo written
 * only after the recursive call returns never terminates on a cycle, and §6
 * runs this inside a React render, so the failure mode is a RangeError and a
 * white screen in the demo video. `verify-prereqs.ts` (§9.5) gates the
 * committed graph, but runtime never assumes the committed JSON is clean.
 */
function longestChain(
  node: string,
  adj: Map<string, string[]>,
  memo: Map<string, number>,
  visiting: Set<string>,
): number {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  if (visiting.has(node)) return 0; // back edge

  visiting.add(node);
  let best = 0;
  for (const next of adj.get(node) ?? []) {
    best = Math.max(best, 1 + longestChain(next, adj, memo, visiting));
  }
  visiting.delete(node);

  memo.set(node, best);
  return best;
}

/** Transitive set of still-needed courses reachable from `node`, excluding it. */
function transitiveDependents(node: string, adj: Map<string, string[]>): string[] {
  const seen = new Set<string>();
  const stack = [...(adj.get(node) ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === node || seen.has(cur)) continue; // the `seen` set is the cycle guard
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------------------
// Cost of delay
// ---------------------------------------------------------------------------

/** Guard for the path walk below. The scope is `remainingRequired` (single
 *  digits for a real audit), so this only fires on a catalog we have not seen. */
const MAX_WALK_STEPS = 50_000;

/**
 * Longest distance IN EDGES from `start` to every node reachable from it, over
 * the same restricted reverse graph §11.1 uses.
 *
 * `longestChain` answers "how deep is the deepest path" — one number. This
 * answers "how far back is each individual course", which is what tells us
 * WHICH dependents fall outside the window when a course slips a term.
 *
 * Relaxation, not enumeration: a node is only re-walked when we reach it by a
 * strictly longer path, so the work is bounded by the number of improvements
 * rather than by the number of paths. `onPath` is the same back-edge guard
 * `longestChain` carries, for the same reason — §6 runs this inside a React
 * render, so a cycle in data we did not author is a white screen.
 */
function longestDistancesFrom(
  start: string,
  adj: Map<string, string[]>,
): Map<string, number> {
  const best = new Map<string, number>();
  const onPath = new Set<string>();
  let steps = 0;

  const walk = (node: string, depth: number): void => {
    if (steps++ > MAX_WALK_STEPS) return;
    if (onPath.has(node)) return; // back edge
    onPath.add(node);
    for (const next of adj.get(node) ?? []) {
      if (next === start) continue; // a cycle back onto the head is not a dependent
      const prev = best.get(next);
      if (prev !== undefined && prev >= depth + 1) continue;
      best.set(next, depth + 1);
      walk(next, depth + 1);
    }
    onPath.delete(node);
  };

  walk(start, 0);
  return best;
}

export interface DelayImpact {
  /** Terms the course plus everything behind it occupies, taken NEXT term. */
  termsNeeded: number;
  /** Fall and spring terms the student has left — `termsRemaining`. */
  termsAvailable: number;
  /**
   * Still-needed courses that no longer fit if this course slips ONE term, and
   * that DO fit if it is taken next term. This is the cost of the delay itself.
   * Deepest first. Always a subset of `Bottleneck.dependents`.
   */
  atRisk: string[];
  /**
   * Still-needed courses already outside the window even if this course is taken
   * next term. Kept separate from `atRisk` deliberately: telling a student a
   * course "breaks if you delay" when it is already unreachable is a false claim
   * in the reassuring direction, and it is the sentence that sends them to an
   * advisor a term too late. Disjoint from `atRisk`.
   */
  beyondWindowNow: string[];
}

/**
 * What one term of delay actually costs, per course.
 *
 * §2's thesis is "a prereq missed in fall pushes an entire downstream sequence
 * back a full year", and §11.1 already computes everything needed to say that
 * about THIS student's own courses rather than in general. A course at distance
 * `d` behind this one is taken in term `1 + d` if this one is taken next term,
 * and in term `2 + d` if it slips — so it falls outside the window exactly when
 * `2 + d > termsAvailable`.
 *
 * Chain arithmetic only. `offeringPenalty` is deliberately not folded in here:
 * it would need each dependent's own offering pattern, and the honest version of
 * that claim is the one `Bottleneck.reason` already makes. This is the same
 * inequality §11.1 classifies urgency with, spelled out per course — not a
 * second opinion about the same course.
 *
 * Pure and injectable on `now`, like `computeBottlenecks`.
 */
export function delayImpact(
  code: string,
  audit: StudentAudit,
  prereqs: PrereqGraph,
  now: Date = new Date(),
): DelayImpact {
  const head = normalizeCode(code);
  const scope = new Set(remainingRequired(audit));
  const termsAvailable = termsRemaining(audit, now);

  if (!scope.has(head)) {
    return { termsNeeded: 1, termsAvailable, atRisk: [], beyondWindowNow: [] };
  }

  const adj = buildReverseGraph(scope, prereqs);
  const distances = longestDistancesFrom(head, adj);

  let deepest = 0;
  const atRisk: { code: string; distance: number }[] = [];
  const beyondWindowNow: { code: string; distance: number }[] = [];

  for (const [dependent, distance] of distances) {
    if (distance > deepest) deepest = distance;
    // Taken next term, this dependent lands in term 1 + distance; a term later,
    // in term 2 + distance.
    if (1 + distance > termsAvailable) {
      beyondWindowNow.push({ code: dependent, distance });
    } else if (2 + distance > termsAvailable) {
      atRisk.push({ code: dependent, distance });
    }
  }

  const deepestFirst = (
    a: { code: string; distance: number },
    b: { code: string; distance: number },
  ) => b.distance - a.distance || a.code.localeCompare(b.code);

  return {
    termsNeeded: 1 + deepest,
    termsAvailable,
    atRisk: atRisk.sort(deepestFirst).map((a) => a.code),
    beyondWindowNow: beyondWindowNow.sort(deepestFirst).map((a) => a.code),
  };
}

// ---------------------------------------------------------------------------
// Reason copy
// ---------------------------------------------------------------------------

function dependentsPhrase(n: number): string {
  if (n === 0) return "Nothing you still need depends on it";
  if (n === 1) return "1 course depends on it";
  return `${n} courses depend on it`;
}

function termsPhrase(n: number): string {
  return n === 1 ? "1 term left" : `${n} terms left`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const URGENCY_RANK: Record<Bottleneck["urgency"], number> = {
  critical: 0,
  soon: 1,
  flexible: 2,
};

/**
 * §11.1. One `Bottleneck` per still-needed course — including the flexible
 * ones, because §13's diagnosis screen renders a "SAFE TO DELAY" column from
 * exactly the same array.
 *
 * `now` is injectable so the smoke tests and the fixtures agree; production
 * passes nothing.
 */
export function computeBottlenecks(
  audit: StudentAudit,
  prereqs: PrereqGraph,
  courses: Course[],
  now: Date = new Date(),
): Bottleneck[] {
  const scopeList = remainingRequired(audit);
  const scope = new Set(scopeList);
  if (scope.size === 0) return [];

  const byCode = new Map<string, Course>();
  for (const course of courses) byCode.set(normalizeCode(course.code), course);

  const adj = buildReverseGraph(scope, prereqs);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const terms = termsRemaining(audit, now);

  const out: Bottleneck[] = scopeList.map((code) => {
    const course = byCode.get(code);
    const chainDepth = longestChain(code, adj, memo, visiting);
    const dependents = transitiveDependents(code, adj);

    // §8/§9.1: termsOffered is NEVER []. A course we could not find in the
    // catalog at all gets the same neutral default the scraper uses, so an
    // unknown code cannot manufacture an offering penalty it has no evidence
    // for.
    const termsOffered: Term[] =
      course && course.termsOffered.length > 0
        ? course.termsOffered
        : (["fall", "spring"] as Term[]);

    // §11.1: summer is never plannable, so it never counts toward the two
    // terms that make an offering "unconstrained".
    const offered = termsOffered.filter((t) => t !== "summer");
    const offeringPenalty = offered.length >= 2 ? 0 : 1;

    const pressure = chainDepth + offeringPenalty;
    const urgency: Bottleneck["urgency"] =
      pressure >= terms ? "critical" : pressure >= terms - 1 ? "soon" : "flexible";

    const parts = [dependentsPhrase(dependents.length)];
    if (offeringPenalty === 1) {
      parts.push(
        offered.length === 1 ? `offered in ${offered[0]} only` : "not offered fall or spring",
      );
    }
    parts.push(termsPhrase(terms));

    return {
      code,
      title: course?.title ?? code,
      chainDepth,
      dependents,
      termsOffered,
      termsRemaining: terms,
      urgency,
      // Comma, not a middot. This is the one display string lib/ produces and
      // BottleneckCard renders it verbatim; it is a sentence about a course, and
      // it was the only place the app's separator glyph appeared inside prose.
      reason: parts.join(", "),
    };
  });

  // §11.1 step 5, plus two deterministic tiebreaks so the same audit always
  // renders the same card order.
  out.sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      b.chainDepth - a.chainDepth ||
      b.dependents.length - a.dependents.length ||
      a.code.localeCompare(b.code),
  );

  return out;
}
