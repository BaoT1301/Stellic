// Reverse Audit — §11.3 schedule generation.
//
// Deterministic, in TypeScript. THE LLM DOES NOT PICK COURSES — §12.3 gives it
// `label`, `why` and `tradeoff` and nothing else. Everything in this file is a
// pure function of the committed JSON plus the parsed audit, which is also the
// build-quality line in §16 ("the model never picks a course").
//
// Every defensive clause below exists because of a specific failure mode named
// in §11.3 or §18, and the comments say which. The one that matters most is
// step 8: the screen that owns the largest block of the demo video must never
// render blank.

import {
  courseNumber,
  electiveLevelOk,
  isUndergraduate,
  normalizeCode,
  prereqsSatisfied,
  remainingRequired,
} from "@/lib/bottlenecks";
import { rmpUrl } from "@/lib/rmp";
import { NEXT_TERM } from "@/lib/types";
import type {
  Bottleneck,
  CatalogSkills,
  Course,
  Preferences,
  PrereqGraph,
  ScheduleOption,
  Section,
  SkillGap,
  StudentAudit,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Local types — §12.3: wire types do NOT go in lib/types.ts.
// ---------------------------------------------------------------------------

/**
 * A finished, conflict-free combination, ready for `POST /api/build-schedules`
 * to add prose to. `ScheduleOption = Combo & { label, why, tradeoff }` by
 * construction, so the route cannot drift from the frozen contract.
 */
export type Combo = Omit<ScheduleOption, "label" | "why" | "tradeoff">;

type Strategy = ScheduleOption["strategy"];

/**
 * The gap list as `lib/gaps.ts` produces it. `postings` is the posting-index
 * membership from §12.2 — §18 finding 4: without it `keeps-options-open` has no
 * input and silently duplicates `max-coverage`. Optional so that a plain
 * `SkillGap[]` (the frozen §8 type) still type-checks as an argument.
 */
export type GapInput = SkillGap & { postings?: number[] };

/** A course we could actually put on a card, with the sections we may use. */
export interface EligibleCourse {
  course: Course;
  /** NEXT_TERM sections that also satisfy `Preferences`. Never empty. */
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Tunables. All of them are search caps, not product decisions.
// ---------------------------------------------------------------------------

const TARGET_CREDITS = 15;
const LIGHT_TARGET_CREDITS = 12; // preferences.lighterWorkload
const MORNING_CUTOFF_MINUTES = 10 * 60; // §8: "no section starting before 10:00"
const UPPER_DIVISION = 400; // §11.3 step 6 heaviness
const CREDIT_COMFORT = 13; // §11.3 step 6 balanced penalty knee
const FULL_TIME_CREDITS = 12; // full-time floor — see the balanced score
// Puts gapValue on the same scale as the heaviness penalty — see scoreCombo.
const GAP_VALUE_WEIGHT = 5;

// §11.3 step 5: "Cap the search — take the top ~40 electives by gapValue, then
// enumerate. Do not brute-force the whole catalog."
const MAX_ELECTIVE_CANDIDATES = 40;
const MAX_SECTIONS_PER_COURSE = 4;
const MAX_PICKS = 4; // courses added on top of mustTake
const MAX_NODES = 250_000; // hard stop; DFS visits best candidates first
const TOP_K = 8; // per-strategy shortlist; step 7 needs at most 3

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** "13:30" → 810. Returns null for "" (asynchronous) or anything malformed. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * §11.3: two sections conflict if they share a day CHARACTER and their
 * [start, end) intervals overlap, compared as minutes-since-midnight integers —
 * never as strings.
 *
 * Asynchronous sections (`days === ""`, §9.1) never conflict. That is also the
 * safe answer for a section whose times failed to parse: refusing to schedule
 * around data we could not read would silently delete courses from the catalog.
 */
export function sectionsConflict(a: Section, b: Section): boolean {
  if (!a.days || !b.days) return false;

  const aStart = toMinutes(a.startTime);
  const aEnd = toMinutes(a.endTime);
  const bStart = toMinutes(b.startTime);
  const bEnd = toMinutes(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;

  let sharesDay = false;
  for (const day of a.days) {
    if (b.days.includes(day)) {
      sharesDay = true;
      break;
    }
  }
  if (!sharesDay) return false;

  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// Course facts
// ---------------------------------------------------------------------------

/** A 0-credit course is real (seminars), so only a missing value defaults. */
function creditsOf(course: Course): number {
  return typeof course.credits === "number" && Number.isFinite(course.credits)
    ? course.credits
    : 3;
}

/** §11.3 step 6, verbatim: credits + 1 if the course is 400-level or above. */
function heavinessOf(course: Course): number {
  return creditsOf(course) + (courseNumber(course.code) >= UPPER_DIVISION ? 1 : 0);
}

function matchesPreferences(section: Section, prefs: Preferences): boolean {
  if (prefs.inPersonOnly && section.modality !== "in-person") return false;
  if (prefs.noMornings) {
    const start = toMinutes(section.startTime);
    // An asynchronous section has no meeting time, so it cannot be a morning
    // class. Dropping it here would make "no mornings" delete online courses.
    if (start !== null && start < MORNING_CUTOFF_MINUTES) return false;
  }
  return true;
}

/**
 * §11.3 step 1, `majorRestriction`. The catalog writes these as prose
 * ("Enrollment is limited to students with a major, minor, or concentration in
 * Applied Computer Science, Computer Science or Software Engineering.") and 14
 * of 103 CS courses carry one, including CS 330 and CS 405.
 *
 * We read the list of majors after the final " in " and test it against the
 * student's major string. Two deliberate choices:
 *   • an unparseable restriction PASSES. §0 rule 3 — a false exclusion silently
 *     deletes a required course from every card, and §13's advisor footer is
 *     the honest cover for a false inclusion.
 *   • substring matching is intentionally loose ("Computer Science" matches a
 *     student in "Applied Computer Science"). Loose in the permissive
 *     direction only.
 */
function majorAllows(restriction: string | null | undefined, studentMajor: string): boolean {
  if (!restriction) return true;

  const text = restriction.toLowerCase();
  const student = studentMajor.toLowerCase();
  if (!student.trim()) return true;

  const cut = text.lastIndexOf(" in ");
  if (cut === -1) return true;

  const named = text
    .slice(cut + 4)
    .replace(/\.$/, "")
    .split(/,| or /)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  if (named.length === 0) return true;

  const listed = named.some((major) => student.includes(major));
  // "Students cannot enroll who have a major in Computing Foundations."
  const negated = /cannot enroll|not open to|may not enroll|are excluded/.test(text);
  return negated ? !listed : listed;
}

// ---------------------------------------------------------------------------
// Step 1 — eligibility
// ---------------------------------------------------------------------------

/**
 * §11.3 step 1. Registrability is decided by SECTIONS — `section.term ===
 * NEXT_TERM` — and NEVER by `Course.termsOffered`. You cannot register without
 * a CRN (§8), and `termsOffered` is an observation, not a guarantee.
 */
export function getEligibleCourses(
  audit: StudentAudit,
  preferences: Preferences,
  courses: Course[],
  prereqs: PrereqGraph,
): Map<string, EligibleCourse> {
  const taken = new Set(audit.coursesTaken.map(normalizeCode));
  const eligible = new Map<string, EligibleCourse>();

  for (const course of courses) {
    const code = normalizeCode(course.code);
    if (taken.has(code)) continue;
    // See `isUndergraduate` in lib/bottlenecks.ts — the one addition to the
    // spec's filter list, and the reason a 600-level CRN cannot reach the cart.
    if (!isUndergraduate(code)) continue;

    const sections = (course.sections ?? [])
      .filter((s) => s.term === NEXT_TERM && matchesPreferences(s, preferences))
      // Deterministic order, earliest meeting first; asynchronous sections last
      // so a card prefers a seated section when both exist.
      .sort((a, b) => {
        const aStart = toMinutes(a.startTime);
        const bStart = toMinutes(b.startTime);
        if (aStart === null && bStart !== null) return 1;
        if (bStart === null && aStart !== null) return -1;
        if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
        return a.crn.localeCompare(b.crn);
      })
      .slice(0, MAX_SECTIONS_PER_COURSE);
    if (sections.length === 0) continue;

    if (!prereqsSatisfied(code, prereqs, taken)) continue;
    if (!majorAllows(course.majorRestriction, audit.major)) continue;

    eligible.set(code, { course, sections });
  }

  // "EXCLUDE courses whose coreq list contains anything not already in
  // coursesTaken and not itself eligible next term." Mutually recursive — A can
  // be the coreq of B and vice versa — so this runs to a fixed point rather
  // than in one pass.
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...eligible.keys()]) {
      const coreqs = prereqs[code]?.coreq ?? [];
      const unmet = coreqs.some((raw) => {
        const c = normalizeCode(raw);
        return c !== code && !taken.has(c) && !eligible.has(c);
      });
      if (unmet) {
        eligible.delete(code);
        changed = true;
      }
    }
  }

  return eligible;
}

/**
 * §11.3 step 2, the other half: critical bottlenecks with no registerable
 * section next term. §13 shows these as "not offered next term — see your
 * advisor" and they must NEVER appear on a schedule card.
 */
export function unofferedCriticals(
  bottlenecks: Bottleneck[],
  eligible: ReadonlyMap<string, EligibleCourse>,
): string[] {
  return bottlenecks
    .filter((b) => b.urgency === "critical" && !eligible.has(normalizeCode(b.code)))
    .map((b) => normalizeCode(b.code));
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

interface Candidate {
  code: string;
  course: Course;
  sections: Section[];
  credits: number;
  heaviness: number;
  /** Uncovered gaps this course closes, with the catalog-skills match score. */
  closes: { skillId: string; score: number }[];
  gapValue: number;
  /** In `remainingRequired` — so taking it does NOT spend an elective slot. */
  isRequired: boolean;
  /** §13 renders the ⚠ on anything that is not "flexible". */
  isBottleneck: boolean;
  coreqs: string[];
  /** Lazy: distinct courses this one unlocks. Only used by the §11.3 fallback. */
  unlocks: string[];
}

interface Placed {
  cand: Candidate;
  section: Section;
}

// ---------------------------------------------------------------------------
// Scoring — §11.3 step 6
// ---------------------------------------------------------------------------

interface Scored {
  key: string;
  rows: Placed[];
  totalCredits: number;
  gapsClosed: number;
  gapValue: number;
  heaviness: number;
  optionsScore: number;
  balanced: number;
  /**
   * Still-required courses on the card. §11.3 scores only gap coverage, which
   * leaves every strategy indifferent to degree progress — and that produced
   * 9-credit cards for a student who has 36 credits left across 2 terms. Used
   * as a SECONDARY criterion in every comparator, so each strategy's stated
   * objective still decides first and this only breaks the ties beneath it.
   */
  requiredCount: number;
}

/** Sorted course codes: two combos with the same courses are the same card. */
function comboKey(rows: Placed[]): string {
  return rows
    .map((r) => r.cand.code)
    .sort()
    .join("|");
}

function scoreCombo(
  rows: Placed[],
  demandById: Map<string, number>,
  postingsById: Map<string, number[]>,
  usePostings: boolean,
): Scored {
  let totalCredits = 0;
  let heaviness = 0;

  // skillId → the BEST match score among the courses in this combo. Taking the
  // max rather than summing per course is what makes `gapValue` a property of
  // the combo: two courses that both teach the same DWA close ONE gap, and
  // double-counting it would make `balanced` prefer redundant pairs.
  const closed = new Map<string, number>();

  for (const row of rows) {
    totalCredits += row.cand.credits;
    heaviness += row.cand.heaviness;
    for (const hit of row.cand.closes) {
      const prev = closed.get(hit.skillId);
      if (prev === undefined || hit.score > prev) closed.set(hit.skillId, hit.score);
    }
  }

  let gapValue = 0;
  for (const [skillId, score] of closed) {
    gapValue += (demandById.get(skillId) ?? 0) * score;
  }

  let optionsScore: number;
  if (usePostings) {
    // §11.3 step 6: the union of posting indices across the skills the combo
    // closes. This is the whole point of §12.2's `postings` field — a schedule
    // that answers three different postings keeps three doors open.
    const union = new Set<number>();
    for (const skillId of closed.keys()) {
      for (const posting of postingsById.get(skillId) ?? []) union.add(posting);
    }
    optionsScore = union.size;
  } else {
    // §11.3's named fallback, used only when no gap carries posting membership:
    // maximise the distinct downstream courses unlocked, from prereqs.json.
    const union = new Set<string>();
    for (const row of rows) for (const code of row.cand.unlocks) union.add(code);
    optionsScore = union.size;
  }

  return {
    key: comboKey(rows),
    rows: [...rows],
    totalCredits,
    gapsClosed: closed.size,
    gapValue,
    heaviness,
    optionsScore,
    requiredCount: rows.filter((r) => r.cand.isRequired).length,
    // §11.3 step 6, with GAP_VALUE_WEIGHT added — the spec's raw formula is
    // dimensionally broken and it shows on camera. Measured against the real
    // catalog-skills.json: match scores are mean-centered into 0.15–0.55 and
    // demandCount cannot exceed the number of pasted postings (3 in §13), so
    // gapValue lands at ~0.2–1.5 per course while 0.5 × heaviness is ~1.75–2.0
    // per course. The penalty therefore always outruns the reward and the
    // maximum is the SMALLEST combo: at demandCount 1 the balanced card came
    // out as one 3-credit course next to a four-course max-coverage card.
    // That is §11.3's own "two visually identical cards" failure inverted.
    // Weighting the coverage term makes the two commensurate without touching
    // the penalty structure the spec actually reasoned about.
    // The credit penalty also had to become SYMMETRIC. Penalising only the
    // upper side made "balanced" mean "smallest", and once the elective level
    // floor thinned the candidate pool it settled on a 6-credit card for a
    // student who needs 18 a term. Twelve credits is the full-time floor every
    // registrar's office uses; below it this is not a balanced semester, it is
    // a part-time one, and financial aid generally requires the same number.
    balanced:
      GAP_VALUE_WEIGHT * gapValue -
      0.5 * heaviness -
      2 * Math.max(0, totalCredits - CREDIT_COMFORT) -
      2 * Math.max(0, FULL_TIME_CREDITS - totalCredits),
  };
}

type Comparator = (a: Scored, b: Scored) => number;

// Each strategy's own objective decides first, exactly as §11.3 step 6 states.
// `requiredCount` sits directly beneath it so that among combos the strategy
// rates equally, the one that also advances the degree wins. Without it every
// comparator fell straight through to `totalCredits ASC`, which actively
// preferred the SMALLEST schedule and dropped still-required, already-eligible
// courses (CS 321, CS 330, CS 405) off the card entirely.
const COMPARATORS: Record<Strategy, Comparator> = {
  "max-coverage": (a, b) =>
    b.gapsClosed - a.gapsClosed ||
    b.gapValue - a.gapValue ||
    b.requiredCount - a.requiredCount ||
    a.totalCredits - b.totalCredits ||
    a.key.localeCompare(b.key),
  balanced: (a, b) =>
    b.balanced - a.balanced ||
    b.gapsClosed - a.gapsClosed ||
    b.requiredCount - a.requiredCount ||
    a.totalCredits - b.totalCredits ||
    a.key.localeCompare(b.key),
  // §11.3 step 6: tie-broken by gapsClosed desc then totalCredits asc.
  "keeps-options-open": (a, b) =>
    b.optionsScore - a.optionsScore ||
    b.gapsClosed - a.gapsClosed ||
    b.requiredCount - a.requiredCount ||
    a.totalCredits - b.totalCredits ||
    a.key.localeCompare(b.key),
};

const STRATEGY_ORDER: Strategy[] = ["max-coverage", "balanced", "keeps-options-open"];

/** Bounded, deduped shortlist. Keeps the best variant of each course set. */
class TopK {
  private items: Scored[] = [];

  constructor(private readonly cmp: Comparator) {}

  offer(candidate: Scored): void {
    const existing = this.items.findIndex((i) => i.key === candidate.key);
    if (existing !== -1) {
      if (this.cmp(candidate, this.items[existing]) < 0) this.items[existing] = candidate;
      else return;
    } else {
      this.items.push(candidate);
    }
    this.items.sort(this.cmp);
    if (this.items.length > TOP_K) this.items.length = TOP_K;
  }

  list(): Scored[] {
    return this.items;
  }
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

/**
 * Seat every course in `group` alongside `chosen` without a time conflict.
 *
 * The first course branches at the call site (the DFS tries each of its
 * sections); coreqs are seated greedily with their first non-conflicting
 * section. Coreqs are rare — 24 rules in the whole graph — and branching them
 * too would multiply the search for a case the demo student never reaches.
 */
function seatGreedily(group: Candidate[], chosen: Placed[]): Placed[] | null {
  const placed: Placed[] = [];
  for (const cand of group) {
    const section = cand.sections.find(
      (s) =>
        !chosen.some((p) => sectionsConflict(p.section, s)) &&
        !placed.some((p) => sectionsConflict(p.section, s)),
    );
    if (!section) return null;
    placed.push({ cand, section });
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * §11.3. Pure: same inputs, same three combos, every time.
 *
 * Returns AT MOST three combos, in strategy order. Fewer is legal — §11.3 step
 * 7: "If fewer than three distinct combos exist, §13 renders FEWER cards rather
 * than duplicates."
 */
export function buildSchedules(
  audit: StudentAudit,
  preferences: Preferences,
  gaps: GapInput[],
  bottlenecks: Bottleneck[],
  courses: Course[],
  prereqs: PrereqGraph,
  catalogSkills: CatalogSkills,
): Combo[] {
  const taken = new Set(audit.coursesTaken.map(normalizeCode));
  const requiredSet = new Set(remainingRequired(audit));

  // --- step 1 ---
  const eligible = getEligibleCourses(audit, preferences, courses, prereqs);

  // --- step 4 (needed by step 2) ---
  const targetCredits = preferences.lighterWorkload ? LIGHT_TARGET_CREDITS : TARGET_CREDITS;

  // --- step 3 ---
  // Named requirements carry slotsOpen 0, so only elective buckets contribute.
  // Floored at 1: a parse that reports zero open slots would otherwise score
  // all three strategies identically (§18's note on sample-audit.pdf).
  const slots = Math.max(
    1,
    audit.requirements
      .filter((r) => r.status === "incomplete")
      .reduce((n, r) => n + (Number.isFinite(r.slotsOpen) ? r.slotsOpen : 0), 0),
  );

  // --- gap bookkeeping ---
  const uncovered = gaps.filter((g) => !g.covered);
  const gapsTotal = uncovered.length;
  const demandById = new Map<string, number>();
  const postingsById = new Map<string, number[]>();
  for (const gap of uncovered) {
    demandById.set(gap.skillId, gap.demandCount);
    postingsById.set(gap.skillId, gap.postings ?? []);
  }
  const usePostings = uncovered.some((g) => (g.postings?.length ?? 0) > 0);

  const bottleneckUrgency = new Map<string, Bottleneck["urgency"]>();
  for (const b of bottlenecks) bottleneckUrgency.set(normalizeCode(b.code), b.urgency);

  // --- candidate construction ---
  const skillsByCourse = new Map<string, { skillId: string; score: number }[]>();
  for (const [rawCode, taught] of Object.entries(catalogSkills)) {
    skillsByCourse.set(normalizeCode(rawCode), taught ?? []);
  }

  const candidates = new Map<string, Candidate>();
  for (const [code, entry] of eligible) {
    const closes: { skillId: string; score: number }[] = [];
    for (const hit of skillsByCourse.get(code) ?? []) {
      if (demandById.has(hit.skillId)) {
        closes.push({ skillId: hit.skillId, score: typeof hit.score === "number" ? hit.score : 0 });
      }
    }
    let gapValue = 0;
    for (const hit of closes) gapValue += (demandById.get(hit.skillId) ?? 0) * hit.score;

    candidates.set(code, {
      code,
      course: entry.course,
      sections: entry.sections,
      credits: creditsOf(entry.course),
      heaviness: heavinessOf(entry.course),
      closes,
      gapValue,
      isRequired: requiredSet.has(code),
      isBottleneck: (bottleneckUrgency.get(code) ?? "flexible") !== "flexible",
      coreqs: (prereqs[code]?.coreq ?? [])
        .map(normalizeCode)
        .filter((c) => c !== code && !taken.has(c)),
      unlocks: [],
    });
  }

  if (!usePostings) fillUnlocks(candidates, courses, prereqs, taken);

  // --- step 2: mustTake ---
  const criticalEligible = bottlenecks
    .filter((b) => b.urgency === "critical" && candidates.has(normalizeCode(b.code)))
    .sort((a, b) => b.chainDepth - a.chainDepth || a.code.localeCompare(b.code));

  const mustTake: Candidate[] = [];
  let mustCredits = 0;
  for (const b of criticalEligible) {
    const cand = candidates.get(normalizeCode(b.code));
    if (!cand) continue;
    // "truncated to the largest PREFIX fitting targetCredits" — a prefix, so we
    // stop at the first course that does not fit rather than skipping it.
    if (mustCredits + cand.credits > targetCredits) break;
    mustCredits += cand.credits;
    mustTake.push(cand);
  }

  // Seat mustTake first. A critical course that cannot be seated conflict-free
  // is dropped rather than allowed to empty the whole combo set — §11.3 step 8
  // exists because an empty step 5 is a blank State 4 in the demo video.
  const base: Placed[] = [];
  for (const cand of mustTake) {
    const group = [cand, ...cand.coreqs.map((c) => candidates.get(c)).filter(isCandidate)];
    const groupCredits = group.reduce((n, c) => n + c.credits, 0);
    if (base.reduce((n, p) => n + p.cand.credits, 0) + groupCredits > targetCredits) continue;
    const seated = seatGreedily(group, base);
    if (seated) base.push(...seated);
  }

  const baseCodes = new Set(base.map((p) => p.cand.code));
  const baseCredits = base.reduce((n, p) => n + p.cand.credits, 0);
  const baseSlots = base.filter((p) => !p.cand.isRequired).length;

  // --- step 5: candidate electives, capped ---
  // Every eligible still-REQUIRED course stays in the pool regardless of the
  // cap: it costs no elective slot and clearing it is always worth scoring.
  const pool = [...candidates.values()].filter((c) => !baseCodes.has(c.code));
  const requiredPool = pool.filter((c) => c.isRequired);
  const electivePool = pool
    // Required courses are exempt from the level floor at any number — that is
    // what keeps 200-level CS 262 on the card while keeping MATH 106 off it.
    .filter((c) => !c.isRequired && electiveLevelOk(c.code, audit))
    .sort(
      (a, b) =>
        b.gapValue - a.gapValue ||
        a.heaviness - b.heaviness ||
        a.code.localeCompare(b.code),
    )
    .slice(0, MAX_ELECTIVE_CANDIDATES);

  // REQUIRED FIRST, then gap value. The reverse ordering is defensible on paper
  // and indefensible on screen: a still-required course is degree progress AND
  // costs no elective slot (that is exactly why `slotsUsed` counts only
  // non-required rows), so it should never lose a seat to an elective that
  // merely scores higher. Sorting gapValue first put CS 450 Database Concepts
  // and CS 483 Analysis of Algorithms — both required, both eligible — behind
  // ENGH 389 "Peer Tutoring in Writing across the Disciplines", which closed no
  // gap the combo had not already closed. §0 rule 7: a registrar reads that as
  // a recommender that does not understand the degree.
  const searchPool = [...requiredPool, ...electivePool].sort(
    (a, b) =>
      Number(b.isRequired) - Number(a.isRequired) ||
      b.gapValue - a.gapValue ||
      a.heaviness - b.heaviness ||
      a.code.localeCompare(b.code),
  );

  const shortlists: Record<Strategy, TopK> = {
    "max-coverage": new TopK(COMPARATORS["max-coverage"]),
    balanced: new TopK(COMPARATORS.balanced),
    "keeps-options-open": new TopK(COMPARATORS["keeps-options-open"]),
  };

  let nodes = 0;

  const record = (rows: Placed[]): void => {
    if (rows.length === 0) return;
    const scored = scoreCombo(rows, demandById, postingsById, usePostings);
    for (const strategy of STRATEGY_ORDER) shortlists[strategy].offer(scored);
  };

  const walk = (
    start: number,
    chosen: Placed[],
    credits: number,
    slotsUsed: number,
    picks: number,
  ): void => {
    if (nodes++ > MAX_NODES) return; // pathological catalog guard
    record(chosen);
    if (picks >= MAX_PICKS) return;

    for (let i = start; i < searchPool.length; i++) {
      const cand = searchPool[i];
      if (chosen.some((p) => p.cand.code === cand.code)) continue;

      // "When a combo includes a course with a coreq, add the coreq AND its
      // section before checking credits and conflicts."
      const group = [cand];
      for (const code of cand.coreqs) {
        const co = candidates.get(code);
        if (!co) continue; // step 1 already guaranteed it is takeable or taken
        if (chosen.some((p) => p.cand.code === code)) continue;
        group.push(co);
      }

      const groupCredits = group.reduce((n, c) => n + c.credits, 0);
      if (credits + groupCredits > targetCredits) continue;

      const groupSlots = group.filter((c) => !c.isRequired).length;
      if (slotsUsed + groupSlots > slots) continue;
      if (picks + group.length > MAX_PICKS) continue;

      // Branch over the primary course's sections so a time conflict on one
      // section does not delete the course from the search.
      for (const section of cand.sections) {
        if (chosen.some((p) => sectionsConflict(p.section, section))) continue;
        const head: Placed = { cand, section };
        const rest = group.length > 1 ? seatGreedily(group.slice(1), [...chosen, head]) : [];
        if (!rest) continue;
        walk(
          i + 1,
          [...chosen, head, ...rest],
          credits + groupCredits,
          slotsUsed + groupSlots,
          picks + group.length,
        );
        if (nodes > MAX_NODES) return;
      }
    }
  };

  // Measured on the sample audit against the committed catalog: pool of 42,
  // 138,339 nodes worst case across the five preference combinations — i.e. the
  // enumeration is EXHAUSTIVE under these caps and MAX_NODES never fires. The
  // guard exists for a catalog we have not seen, not for this one.
  walk(0, base, baseCredits, baseSlots, 0);

  // --- step 7: fixed-order dedup walk ---
  const used = new Set<string>();
  const out: Combo[] = [];
  for (const strategy of STRATEGY_ORDER) {
    const pick = shortlists[strategy].list().find((c) => !used.has(c.key));
    if (!pick) continue;
    used.add(pick.key);
    out.push(toCombo(strategy, pick, gapsTotal, requiredSet));
  }
  if (out.length > 0) return out;

  // --- step 8: FLOOR ---
  // "If enumeration yields nothing, fall back to mustTake plus the single
  // highest-gapValue eligible elective that fits." Reached only when the search
  // was starved (no base, nothing fits, or the node guard tripped on the first
  // branch). The screen never goes blank.
  const floorRows: Placed[] = [...base];
  let floorCredits = baseCredits;
  for (const cand of searchPool) {
    if (floorRows.some((p) => p.cand.code === cand.code)) continue;
    if (floorCredits + cand.credits > targetCredits) continue;
    const seated = seatGreedily([cand], floorRows);
    if (!seated) continue;
    floorRows.push(...seated);
    floorCredits += cand.credits;
    break;
  }
  if (floorRows.length === 0) return [];

  const scored = scoreCombo(floorRows, demandById, postingsById, usePostings);
  return [toCombo("max-coverage", scored, gapsTotal, requiredSet)];
}

function isCandidate(c: Candidate | undefined): c is Candidate {
  return c !== undefined;
}

/**
 * §11.3's zero-API-change fallback for `keeps-options-open`: how many distinct
 * catalog courses each candidate unlocks on its own.
 *
 * Single-course marginal, not the joint unlock of a whole combo — a course
 * gated on two of the picks is not counted. That understates rather than
 * invents, and it is only reached when `postings` is absent.
 */
function fillUnlocks(
  candidates: Map<string, Candidate>,
  courses: Course[],
  prereqs: PrereqGraph,
  taken: ReadonlySet<string>,
): void {
  const blocked = courses
    .map((c) => normalizeCode(c.code))
    .filter((code) => !taken.has(code) && !prereqsSatisfied(code, prereqs, taken));

  for (const cand of candidates.values()) {
    const withCourse = new Set(taken);
    withCourse.add(cand.code);
    cand.unlocks = blocked.filter(
      (code) => code !== cand.code && prereqsSatisfied(code, prereqs, withCourse),
    );
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function toCombo(
  strategy: Strategy,
  scored: Scored,
  gapsTotal: number,
  requiredSet: ReadonlySet<string>,
): Combo {
  // ⚠ rows first, then the rest of what she has to take, then electives.
  const rows = [...scored.rows].sort(
    (a, b) =>
      Number(b.cand.isBottleneck) - Number(a.cand.isBottleneck) ||
      Number(b.cand.isRequired) - Number(a.cand.isRequired) ||
      a.cand.code.localeCompare(b.cand.code),
  );

  return {
    id: strategy,
    strategy,
    courses: rows.map((row) => ({
      code: row.cand.code,
      title: row.cand.course.title,
      section: row.section,
      isBottleneck: row.cand.isBottleneck,
      skillsClosed: row.cand.closes.map((c) => c.skillId),
      // §11.4/§5: we build the URL and render it as a link. We never fetch it.
      rmpUrl: rmpUrl(row.section.instructor),
    })),
    totalCredits: scored.totalCredits,
    bottlenecksCleared: rows.filter((r) => r.cand.isBottleneck).length,
    gapsClosed: scored.gapsClosed,
    gapsTotal,
    // A still-required course does not spend an elective slot — only a course
    // outside `requirements[].missing` does.
    slotsUsed: rows.filter((r) => !requiredSet.has(r.cand.code)).length,
    // §8: [] by construction — step 5 only ever emits conflict-free combos.
    conflicts: [],
  };
}
