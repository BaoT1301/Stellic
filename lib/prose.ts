// Copy that has to be written without the model — CLAUDE.md §0 rule 3.
//
// Everything here is deterministic prose for a degraded path. It lives in lib/
// rather than beside the one screen that first needed it because both ends of a
// degradation need the same sentence: /api/build-schedules writes local copy
// when the model fails, and app/page.tsx has to write the SAME copy when the
// request never reaches the route at all (§19 — the client used to set
// `options = []` on a network failure and throw away combos it had computed
// locally moments earlier).
//
// Nothing in this file may state a fact it was not handed. Every number below
// is read off a Combo that lib/schedules.ts already computed; none is derived.

import type { Combo, Ineligibility } from "@/lib/schedules";
import { NEXT_TERM_LABEL, type ScheduleOption } from "@/lib/types";

/** Deterministic copy for a strategy the model omitted. Never blank, never a
 *  placeholder — §0 rule 3, every feature degrades to something that renders. */
export function fallbackProse(
  combo: Combo,
): Pick<ScheduleOption, "label" | "why" | "tradeoff"> {
  const codes = combo.courses.map((c) => c.code).join(", ");
  const label =
    combo.strategy === "max-coverage"
      ? "Closes the most skill gaps"
      : combo.strategy === "balanced"
        ? "Clears the blockers at a lighter load"
        : "Keeps the most courses open";
  return {
    label,
    why: `${codes} — clears ${combo.bottlenecksCleared} blocked ${
      combo.bottlenecksCleared === 1 ? "course" : "courses"
    } and closes ${combo.gapsClosed} of ${combo.gapsTotal} open skills at ${combo.totalCredits} credits.`,
    tradeoff: `Uses ${combo.slotsUsed} of your elective ${
      combo.slotsUsed === 1 ? "slot" : "slots"
    } and ${combo.totalCredits} credits this term.`,
  };
}

/** "CS 262" · "CS 262 and CS 310" · "CS 262, CS 310 and CS 367". */
function joinCodes(codes: string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/**
 * Why a critical course cannot reach a schedule card — the actual filter that
 * rejected it, not one plausible cause standing in for seven.
 *
 * The banner used to print "has no {term} section" over the whole list.
 * `getEligibleCourses` drops a course on any of six tests and returns only
 * survivors, so that sentence was a guess, and for a major-restricted course it
 * was a guess a registrar disproves from Patriot Web in 30 seconds — CS 330 has
 * three live Fall 2026 CRNs (§0 rule 7). Every branch below is generated from
 * `lib/schedules.ts`'s own verdict plus the parsed audit; no course code, title
 * or offering claim is written into this file (§13).
 *
 * Lives here rather than in DiagnosisScreen because TWO screens now render this
 * verdict — the diagnosis list from `ineligibleCriticals`, and the schedules
 * screen from `unplacedCriticals` — and one verdict must not acquire two
 * voices.
 */
export function ineligibilityCopy(entry: Ineligibility, major: string): string {
  const cannotInclude = `so nothing we build can include it — see your advisor.`;
  switch (entry.reason) {
    case "no-section":
      return `has no ${NEXT_TERM_LABEL} section, ${cannotInclude}`;
    case "graduate-level":
      return `is a graduate course, ${cannotInclude}`;
    case "unmet-coreq":
      return `must be taken alongside ${joinCodes(entry.blockers)}, which ${
        entry.blockers.length === 1 ? "is" : "are"
      } not available to you next term — see your advisor.`;
    // A false NEGATIVE, not a hard exclusion: `majorAllows` matches the catalog's
    // restriction prose against a free-text major string, so "CS" fails where
    // "Computer Science" passes. Asserting she cannot take it would trade one
    // false claim for another, so this branch points at the advisor and leaves
    // the question open.
    case "major-restricted":
      return `restricts enrollment by major and we could not match yours${
        major.trim() ? ` (“${major.trim()}”)` : ""
      }. It may still be open to you — confirm with your advisor.`;
    // Unreachable from the DIAGNOSIS screen: app/page.tsx passes the default
    // preferences there and filters out anything with a `blockedBy` (the "Can't
    // take yet" group explains those). "preferences" IS reachable from the
    // schedules screen, where the toggles are live and are the student's own.
    case "preferences":
      return `has no ${NEXT_TERM_LABEL} section matching your current preferences.`;
    case "unmet-prereq":
      return `needs ${joinCodes(entry.blockers)} first.`;
    // The course passed every eligibility filter — it IS offered next term and
    // the student CAN register for it — and still reached no card, because the
    // combination it belonged to overran the credit target or could not be
    // seated conflict-free. Reusing "no-section" here would be a checkably
    // false claim about a course with live CRNs, which is the whole reason this
    // variant exists. It is also the only branch that suggests registering
    // directly, because that is the only branch where the student actually can.
    case "did-not-fit":
      return `is offered next term, but it would not fit alongside the other courses these schedules have to clear — see your advisor about registering for it separately.`;
  }
}
