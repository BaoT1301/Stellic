// Reverse Audit — zod schemas for the three OpenAI Structured Outputs calls.
//
// See CLAUDE.md §12. These are wire schemas for `callStructured()` ONLY. They
// are not new data contracts: everything the UI consumes is already frozen in
// §8 / lib/types.ts, and each schema below is checked against the frozen type at
// the bottom of this file so a drift is a compile error rather than a demo bug.
//
// ---------------------------------------------------------------------------
// RULES THAT MADE THIS FILE LOOK THE WAY IT DOES — read before editing.
//
// 1. `strict: true` requires `additionalProperties: false` on EVERY nested
//    object and EVERY property present in `required`. `zodResponseFormat` emits
//    both automatically for a plain `z.object()`, which is the entire reason
//    §12 chose zod over hand-written JSON Schema — the miss that costs you is
//    the nested one (a `Section` inside `courses[]`), and it surfaces as a
//    runtime 400 mid-demo, not as a type error.
//
// 2. `.nullable()`, NEVER `.optional()`. An optional property is absent from
//    `required`, which strict mode rejects outright. §18 finding 3: a
//    non-nullable `expectedGraduation` forced the model to INVENT a graduation
//    date that §11.1 then derived the whole urgency ranking from.
//
// 3. No `pattern` / `min` / `max` / `int` beyond the one `expectedGraduation`
//    pattern §8 actually specifies. Every extra keyword is one more way to earn
//    a 400 for zero demo benefit, and the routes already normalize the model's
//    output defensively.
//
// 4. Strict mode cannot express `Record<string, T>` (no `patternProperties`),
//    so anything map-shaped is modelled as an array with the key as a field and
//    folded back in the route. Same trick §9.2 uses for the prereq graph.
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { ScheduleOption, StudentAudit } from "@/lib/types";

// ---------------------------------------------------------------------------
// §12.1 — POST /api/parse-audit
// ---------------------------------------------------------------------------

export const requirementSchema = z.object({
  name: z.string(),
  status: z.enum(["complete", "incomplete"]),
  missing: z.array(z.string()),
  slotsOpen: z.number(),
  credits: z.number(),
});

export const studentAuditSchema = z.object({
  major: z.string(),
  // Nullable for the reason in rule 2 above: a degree audit that does not print
  // its catalog year must not make the model guess one.
  catalogYear: z.string().nullable(),
  creditsCompleted: z.number(),
  creditsRequired: z.number(),
  // The ONE constraint §8 asks for: "2027-12". lib/bottlenecks.ts parses this
  // into termsRemaining, so a free-form "Spring 2027" here breaks the urgency
  // ranking silently. Null is the honest answer when the audit doesn't say.
  expectedGraduation: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  coursesTaken: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

export type ParsedAudit = z.infer<typeof studentAuditSchema>;

// ---------------------------------------------------------------------------
// §12.2 — POST /api/extract-skills
//
// `postings` carries the INDICES of the pasted postings that asked for the
// skill. §18 finding 4: without it, §11.3's `keeps-options-open` strategy has
// no input at all and silently renders a duplicate of `max-coverage` on the
// screen that owns the largest block of the video. `demandCount` is a
// cardinality and cannot be inverted back into a membership set.
// ---------------------------------------------------------------------------

export const extractedSkillSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  demandCount: z.number(),
  postings: z.array(z.number()),
});

export const extractedSkillsSchema = z.object({
  skills: z.array(extractedSkillSchema),
});

export type ExtractedSkill = z.infer<typeof extractedSkillSchema>;
export type ExtractedSkills = z.infer<typeof extractedSkillsSchema>;

// ---------------------------------------------------------------------------
// §12.3 — POST /api/build-schedules
//
// The model's ONLY job is prose. It never sees a CRN it could move and never
// returns a course array it could reorder — it returns three short strings per
// combo, keyed by the strategy, and the route joins them back onto the combos
// the client already computed deterministically in lib/schedules.ts.
//
// `strategy` is the join key rather than a free-form id precisely so a
// hallucinated key cannot silently attach the wrong prose to the wrong card.
// ---------------------------------------------------------------------------

export const scheduleStrategySchema = z.enum([
  "max-coverage",
  "balanced",
  "keeps-options-open",
]);

export const scheduleProseItemSchema = z.object({
  strategy: scheduleStrategySchema,
  label: z.string(),
  why: z.string(),
  tradeoff: z.string(),
});

export const scheduleProseSchema = z.object({
  options: z.array(scheduleProseItemSchema),
});

export type ScheduleProseItem = z.infer<typeof scheduleProseItemSchema>;
export type ScheduleProse = z.infer<typeof scheduleProseSchema>;

// ---------------------------------------------------------------------------
// Frozen-contract guards.
//
// Compile-time only — a constrained type alias emits no JavaScript, and it
// turns "the wire schema drifted away from §8" from a blank screen in the demo
// into a red squiggle here. If one of these errors, fix THIS file;
// lib/types.ts is frozen (§0 rule 2).
// ---------------------------------------------------------------------------

type AssertAssignable<Wire extends Frozen, Frozen> = Wire;

// A ParsedAudit must be usable anywhere a StudentAudit is required.
export type _AuditIsStudentAudit = AssertAssignable<ParsedAudit, StudentAudit>;

// The prose fields must line up with the three §8 fields the model owns.
export type _ProseCoversScheduleFields = AssertAssignable<
  Pick<ScheduleProseItem, "label" | "why" | "tradeoff">,
  Pick<ScheduleOption, "label" | "why" | "tradeoff">
>;

// And the strategy enum must stay identical to the frozen union.
export type _StrategyMatches = AssertAssignable<
  ScheduleProseItem["strategy"],
  ScheduleOption["strategy"]
>;
