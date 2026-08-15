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

import type { Combo } from "@/lib/schedules";
import type { ScheduleOption } from "@/lib/types";

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
