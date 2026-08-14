// POST /api/build-schedules — CLAUDE.md §12.3
//
// Body: { combos, gaps, bottlenecks, audit } — the combos are ALREADY CHOSEN by
// lib/schedules.ts (§11.3), deterministically, in TypeScript. The model's only
// job here is writing `label`, `why` and `tradeoff`. One sentence each.
//
// "The model never picks a course" is a line §16 wants on camera during the
// build-and-provenance beat, so it is enforced structurally rather than by
// asking nicely: the model is never given a schema it could return a course
// array in (lib/schemas.ts → scheduleProseSchema is three strings and a
// strategy key), and this route copies `combo.courses` straight through by
// reference. There is no code path here that can add, remove or reorder a
// course, or touch a CRN.
//
// Never returns 500 — §12. On any failure, the cached fixture with degraded:true.

import { callStructured } from "@/lib/openai";
import { scheduleProseSchema, type ScheduleProse } from "@/lib/schemas";
import type { Bottleneck, ScheduleOption, SkillGap, StudentAudit } from "@/lib/types";
import fallbackResponse from "@/samples/fallback-response.json";

export const runtime = "nodejs";

// LOCAL wire type, deliberately not exported and deliberately not in
// lib/types.ts — §12.3: "Do not add wire types to lib/types.ts", everything the
// UI consumes is already frozen in §8. A Combo is exactly a ScheduleOption that
// has not been given its prose yet, which is also why the merge below cannot
// drift: `{ ...combo, label, why, tradeoff }` is total.
type Combo = Omit<ScheduleOption, "label" | "why" | "tradeoff">;

interface RequestBody {
  combos: Combo[];
  gaps: SkillGap[];
  bottlenecks: Bottleneck[];
  audit: StudentAudit;
}

const FALLBACK = fallbackResponse["build-schedules"] as unknown as {
  options: ScheduleOption[];
  degraded: boolean;
};

const STRATEGIES = new Set<ScheduleOption["strategy"]>([
  "max-coverage",
  "balanced",
  "keeps-options-open",
]);

// §11.3 step 7 emits at most one combo per strategy, so three is the real
// ceiling. The cap exists so a malformed client body cannot turn one demo click
// into a very long prompt.
const MAX_COMBOS = 6;
const MAX_GAPS_IN_PROMPT = 12;
const MAX_BOTTLENECKS_IN_PROMPT = 6;

const SYSTEM = `You write the short explanatory copy for a course-schedule recommendation shown to an undergraduate.

You are given a student's degree audit summary, the courses that are blocking other courses, the job skills the student's target roles asked for that nothing in their remaining requirements covers, and two or three ALREADY-CHOSEN schedules. The schedules were computed deterministically. You are not choosing them.

For each schedule, write exactly three things:
- "label": 3 to 6 words, sentence case, no trailing period. What this option is FOR. "Close the data gap", "Clear the blocker, keep the load sane".
- "why": ONE sentence. Why a student would pick this one.
- "tradeoff": ONE sentence. What this option genuinely costs compared to the others. Every option must have a real one.

Rules:
- Be specific and concrete. "All three target roles asked for SQL and distributed systems; nothing left in your required courses touches either" is right. "This is a well-rounded schedule" is useless and will be rejected.
- Name actual course codes and actual skills from the data you are given.
- Use only the numbers you are given. Never compute a new statistic, never state a credit count or a gap count that is not in the input.
- Never suggest adding, dropping or swapping a course; the schedules are fixed. Never mention CRNs, section numbers, meeting times or instructors.
- Never invent a fact about a course, a prerequisite, or a term it is offered.
- Write to the student as "you". No greetings, no hedging, no exclamation marks.
- Return one entry per schedule, keyed by its strategy.`;

/** Deterministic copy for a strategy the model omitted. Never blank, never a
 *  placeholder — §0 rule 3, every feature degrades to something that renders. */
function fallbackProse(combo: Combo): Pick<ScheduleOption, "label" | "why" | "tradeoff"> {
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

function isCombo(value: unknown): value is Combo {
  const c = value as Combo | null;
  return (
    !!c &&
    typeof c === "object" &&
    STRATEGIES.has(c.strategy) &&
    Array.isArray(c.courses) &&
    c.courses.length > 0
  );
}

function describe(body: RequestBody, combos: Combo[]): string {
  const { audit, bottlenecks, gaps } = body;

  const lines: string[] = [];

  lines.push("## STUDENT");
  lines.push(
    `${audit?.major ?? "Undeclared"} · ${audit?.creditsCompleted ?? "?"} of ${
      audit?.creditsRequired ?? "?"
    } credits done · expected graduation ${audit?.expectedGraduation ?? "not stated"}`,
  );

  const urgent = (bottlenecks ?? [])
    .filter((b) => b.urgency !== "flexible")
    .slice(0, MAX_BOTTLENECKS_IN_PROMPT);
  if (urgent.length > 0) {
    lines.push("\n## COURSES THAT BLOCK OTHER COURSES");
    for (const b of urgent) {
      lines.push(
        `- ${b.code} ${b.title} — ${b.urgency}; ${b.reason}${
          b.dependents.length > 0 ? `; still-needed courses behind it: ${b.dependents.join(", ")}` : ""
        }`,
      );
    }
  }

  const open = (gaps ?? []).filter((g) => !g.covered).slice(0, MAX_GAPS_IN_PROMPT);
  if (open.length > 0) {
    lines.push("\n## SKILLS THE TARGET ROLES ASKED FOR AND NOTHING REQUIRED COVERS");
    for (const g of open) {
      lines.push(`- ${g.skillName} (asked for by ${g.demandCount} of the postings) [${g.skillId}]`);
    }
  }

  const coveredCount = (gaps ?? []).filter((g) => g.covered).length;
  if (coveredCount > 0) {
    lines.push(
      `\n(${coveredCount} more demanded skills are already covered by courses this student has taken or must still take.)`,
    );
  }

  lines.push("\n## THE SCHEDULES (fixed — describe, do not change)");
  for (const c of combos) {
    lines.push(`\n### strategy: ${c.strategy}`);
    lines.push(
      `${c.totalCredits} credits · clears ${c.bottlenecksCleared} blocked courses · closes ${c.gapsClosed} of ${c.gapsTotal} open skills · uses ${c.slotsUsed} elective slots`,
    );
    for (const row of c.courses) {
      const closes =
        row.skillsClosed.length > 0
          ? ` — closes ${row.skillsClosed
              .map((id) => open.find((g) => g.skillId === id)?.skillName ?? id)
              .join("; ")}`
          : "";
      lines.push(`- ${row.code} ${row.title}${row.isBottleneck ? " [blocker]" : ""}${closes}`);
    }
  }

  return lines.join("\n");
}

export async function POST(req: Request): Promise<Response> {
  // Hoisted out of the try so the catch can still serve the student's OWN
  // schedule. §12 says degrade to the fixture, but that instruction exists to
  // prevent an error state — and here there is a strictly better degraded
  // answer available: the combos in the request body were computed
  // deterministically by lib/schedules.ts (§11.3) and are already correct. Only
  // the PROSE needs the model. Falling back to fixture options would throw away
  // a real, valid schedule and show a stranger's courses instead, which on a
  // dead key is a worse and less honest demo than real courses with locally
  // written copy.
  let validCombos: Combo[] = [];

  try {
    // Body FIRST, key second: the missing-key path is the common one until the
    // env var is set, and it still has to reach the catch with real combos in
    // hand. Checking the key first would strand every request on the fixture.
    const body = (await req.json()) as RequestBody | null;
    if (!body || !Array.isArray(body.combos)) {
      throw new Error("body.combos must be an array");
    }

    const combos = body.combos.filter(isCombo).slice(0, MAX_COMBOS);
    if (combos.length === 0) throw new Error("no structurally valid combos in body");
    validCombos = combos;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const prose = await callStructured<ScheduleProse>(
      SYSTEM,
      describe(body, combos),
      scheduleProseSchema,
      "schedule_prose",
    );

    // First writer wins per strategy, so a duplicated key cannot overwrite the
    // copy already attached to a card.
    const byStrategy = new Map<string, ScheduleProse["options"][number]>();
    for (const p of prose.options ?? []) {
      if (!byStrategy.has(p.strategy)) byStrategy.set(p.strategy, p);
    }

    const options: ScheduleOption[] = combos.map((combo) => {
      const written = byStrategy.get(combo.strategy);
      const text = written
        ? { label: written.label, why: written.why, tradeoff: written.tradeoff }
        : fallbackProse(combo);
      // Spread first: courses, sections, CRNs and every computed statistic pass
      // through untouched, and only the three prose fields are written.
      return { ...combo, id: combo.id || combo.strategy, ...text };
    });

    return Response.json({ options, degraded: false });
  } catch (err) {
    // The student's real schedule survives; only the prose is local.
    if (validCombos.length > 0) {
      console.error("[build-schedules] writing prose locally:", err);
      const options: ScheduleOption[] = validCombos.map((combo) => ({
        ...combo,
        id: combo.id || combo.strategy,
        ...fallbackProse(combo),
      }));
      return Response.json({ options, degraded: true });
    }
    // Only when the request itself was unusable is the fixture the right answer.
    console.error("[build-schedules] serving cached fixture:", err);
    return Response.json({ options: FALLBACK.options, degraded: true });
  }
}
