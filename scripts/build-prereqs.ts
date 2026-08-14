// scripts/build-prereqs.ts — CLAUDE.md §9.2, model path
//
//   prereqText (Banner boolean grammar) → data/prereqs.json (PrereqGraph)
//   via gpt-4o-2024-11-20 + Structured Outputs.
//
// Run:  npx tsx scripts/build-prereqs.ts             # writes data/prereqs.json
//       npx tsx scripts/build-prereqs.ts --compare   # writes NOTHING; diffs the
//                                                    #   model against the
//                                                    #   committed graph
//       npx tsx scripts/build-prereqs.ts --out data/prereqs.model.json
//
// Requires OPENAI_API_KEY. Load it however you load it for `next dev` — e.g.
//       (bash)  OPENAI_API_KEY=sk-... npx tsx scripts/build-prereqs.ts
//       (pwsh)  $env:OPENAI_API_KEY="sk-..."; npx tsx scripts/build-prereqs.ts
// tsx does not read .env.local; Next.js does. That asymmetry is why the check
// below prints the two invocations verbatim instead of just saying "no key".
//
// ****************************************************************************
// STATUS AS COMMITTED: THIS SCRIPT HAS NEVER BEEN EXECUTED.
//   It was written against §9.2 in an environment with no OPENAI_API_KEY, so it
//   is provisional: reviewed and type-checked, but not observed against a live
//   response. The committed data/prereqs.json was produced by the deterministic
//   parser (scripts/parse-prereqs.ts), NOT by this script.
//   Run --compare first. It costs the same as a normal run, writes nothing, and
//   tells you how far the model is from a parser that is known to reproduce
//   §9.2's two verified ground-truth strings exactly.
// ****************************************************************************
//
// WHY BOTH SCRIPTS EXIST — the honest framing, and the one to use in the
// write-up. §9.2 says to soften the claim: catalog prereqs are a grade-coded
// grammar that differs at every institution, so we parse them with a model and
// validate every emitted course code against courses.json. At GMU specifically
// the grammar turned out to be regular enough to parse exactly, so the
// deterministic parser is what ships and the model is the cross-check. At the
// next institution — where the same field is English prose — the two swap
// places without any downstream code changing, because both write the same
// frozen PrereqGraph (§8).
//
// SCHEMA SHAPE, per §9.2: Structured Outputs `strict: true` CANNOT express
// Record<string, T>. It demands additionalProperties:false plus every property
// named in `required`, and patternProperties is unsupported. So the model
// returns { rules: [{ code, allOf, oneOf, minGrade, coreq }] } — a wrapper
// declared LOCALLY here, never added to lib/types.ts — and this script folds it
// with Object.fromEntries. §8 is untouched.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { callStructured } from "@/lib/openai";
import type { Course, PrereqGraph, PrereqRule } from "@/lib/types";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const COURSES_PATH = DATA_DIR + "courses.json";
const DEFAULT_OUT = DATA_DIR + "prereqs.json";

// §9.2: "Batch ~20 courses per call." 274 blocks → 14 calls. Small enough that
// a truncated response is implausible, large enough that the (long) system
// prompt is amortised instead of resent 274 times.
const BATCH_SIZE = 20;

// One retry. A structured-output call fails for two reasons — a transient 5xx,
// which a retry fixes, and a schema the model cannot satisfy, which a retry
// never fixes. Retrying more than once only burns money on the second case.
const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Wire schema — LOCAL to this script by §9.2's instruction. Every field is
// required and non-optional because strict mode has no notion of "optional";
// minGrade is .nullable() instead, exactly as StudentAudit.catalogYear is in §8.
// ---------------------------------------------------------------------------

const PrereqRuleWire = z.object({
  code: z
    .string()
    .describe('The course this rule belongs to, canonical "DEPT NNN".'),
  allOf: z
    .array(z.string())
    .describe("Course codes that are ALL required. Empty array if none."),
  oneOf: z
    .array(z.array(z.string()))
    .describe(
      "Groups of alternatives; the student needs at least one course from each " +
        "group. Empty array if none.",
    ),
  minGrade: z
    .string()
    .nullable()
    .describe('Minimum grade for the block, e.g. "C" or "B-". null if absent.'),
  coreq: z
    .array(z.string())
    .describe(
      "Courses explicitly marked as allowed to be taken concurrently. Empty " +
        "array if none.",
    ),
});

const PrereqBatch = z.object({
  rules: z.array(PrereqRuleWire),
});
type PrereqBatch = z.infer<typeof PrereqBatch>;

// ---------------------------------------------------------------------------
// Prompt. Built against the Banner grammar, NOT against prose (§9.2). Every
// rule below is a gotcha verified against the live CS catalog; the two
// few-shots are §9.2's two verified strings, reproduced character for
// character, with the outputs the deterministic parser produces for them.
// ---------------------------------------------------------------------------

const SYSTEM = `You convert George Mason University catalog prerequisite blocks into structured rules.

These are NOT prose. GMU emits a Banner-generated boolean expression with grade codes written as superscripts (rendered here as ^X). Parse it as a boolean expression.

GRAMMAR
  - "and" is conjunction, "or" is disjunction, parentheses group.
  - A COMMA inside a group is an "or": "(STAT 344^C, 334^C or 346^C)" lists three ALTERNATIVES.
  - A bare number means the nearest subject named to its left: in "(CS 211^C or 211^XS)" both tokens are CS 211; in "CS 262^C, 222^C, ECE 340^C" the 222 is CS 222 and 340 is ECE 340.
  - Course codes are always "DEPT NNN" with one ASCII space.

SUFFIX CODES — these decide the whole task
  - ^XS and ^XP mark TRANSFER or TEST CREDIT for the same course. They are NOT grades and NOT separate courses. "CS 211^C or 211^XS" is ONE course, CS 211, with two ways to have earned it. Emit CS 211 once. Never emit "CS 211XS", never list CS 211 twice in the same group.
  - A number followed by T ("104T"), or prefixed with L or U ("L341", "U113"), is the same idea in different notation: still the same course. "IT 341^C, L341, 341^XS or 341" is ONE course, IT 341.
  - ^* means "may be taken concurrently" (a footnote at the end of the block says so). Put such a course in coreq.
  - ^A ^B ^B- ^C ^C- ^D are the real grade codes. GMU does not mix grade codes inside one block, so report one minGrade for the whole rule. If codes do differ, report the strictest.

NON-COURSE TOKENS — discard them, do not emit them as courses
  - "minimum score of 80 in 'Math Placement Aleks'" is a placement test, not a course. Discard the token and keep the courses listed next to it.
  - "ENGH 2---" is a wildcard for any 200-level course. Discard it.

OUTPUT SHAPE
  - allOf: courses required unconditionally.
  - oneOf: one array per group of alternatives; the student needs one course from each array.
  - Distribute properly. "A and (B or (C and D))" means A is required AND at least one of B/C is needed AND at least one of B/D is needed — because satisfying the (C and D) branch requires both. Never flatten "(B or (C and D))" into a single group [B, C, D]: that would falsely say C alone is enough.
  - coreq: only courses marked ^*.
  - Emit exactly one rule per course code you are given, in the same order, even if the rule ends up empty.`;

const FEWSHOT_USER = `CS 330 :: Required Prerequisites: ((CS 211^C or 211^XS) and (MATH 125^C or 125^XS)).
CS 484 :: Required Prerequisites: (CS 310^C or 310^XS) and ((STAT 344^C, 344^XS, 334^C, 334^XS or 346^C) or (MATH 351^C and 352^C)).
CS 262 :: Required Prerequisites: (CS 110^*^C, 110^XS or 101^*) and (CS 211^C, 211^XS, 222^C or 222^XS). ^* May be taken concurrently.
CS 112 :: Required Prerequisites: ((minimum score of 80 in 'Math Placement Aleks', MATH 104^C, 104T, 105^C, 105T, 105^XS, 113^C, 113^XS, 115^C, 123^C or 123^XS)).`;

const FEWSHOT_ASSISTANT = JSON.stringify({
  rules: [
    // Two courses, two credit paths each. The XS twins collapse away entirely.
    { code: "CS 330", allOf: ["CS 211", "MATH 125"], oneOf: [], minGrade: "C", coreq: [] },
    // The distribution case. (STAT...) or (MATH 351 and 352) becomes two groups,
    // NOT one flat group — flattening would claim MATH 351 alone suffices.
    {
      code: "CS 484",
      allOf: ["CS 310"],
      oneOf: [
        ["STAT 344", "STAT 334", "STAT 346", "MATH 351"],
        ["STAT 344", "STAT 334", "STAT 346", "MATH 352"],
      ],
      minGrade: "C",
      coreq: [],
    },
    // ^* → coreq. CS 101 is a retired course with no catalog entry, so the
    // first group collapses to the single concurrent course CS 110.
    { code: "CS 262", allOf: [], oneOf: [["CS 211", "CS 222"]], minGrade: "C", coreq: ["CS 110"] },
    // The placement score is discarded; the MATH alternatives beside it survive.
    {
      code: "CS 112",
      allOf: [],
      oneOf: [["MATH 104", "MATH 105", "MATH 113", "MATH 115", "MATH 123"]],
      minGrade: "C",
      coreq: [],
    },
  ],
});

// ---------------------------------------------------------------------------

interface Stats {
  droppedCodes: Map<string, number>;
  emptiedGroups: number;
  missingRules: string[]; // asked for, model did not return
  unexpectedRules: string[]; // returned, never asked for
  failedBatches: number[];
}

// §9.2: "validate every emitted course code against courses.json." The model is
// the one component here that can hallucinate a course number that looks
// completely plausible — "CS 315" is indistinguishable from "CS 310" to anyone
// reading the output. This is the check that makes the model path safe to ship.
function sanitise(
  rule: PrereqRule & { code: string },
  catalog: Set<string>,
  stats: Stats,
): PrereqRule | null {
  const drop = (code: string) => {
    stats.droppedCodes.set(code, (stats.droppedCodes.get(code) ?? 0) + 1);
  };
  const keep = (code: string) => {
    const ok = catalog.has(code);
    if (!ok) drop(code);
    return ok;
  };

  const allOf = [...new Set(rule.allOf.filter(keep))];
  const coreq = [...new Set(rule.coreq.filter(keep))].filter(
    (c) => !allOf.includes(c),
  );
  const oneOf: string[][] = [];
  for (const group of rule.oneOf) {
    const kept = [...new Set(group.filter(keep))];
    if (kept.length === 0) {
      if (group.length > 0) stats.emptiedGroups += 1;
      continue;
    }
    // A one-element "group" is a unit clause; it belongs in allOf.
    if (kept.length === 1) {
      if (!allOf.includes(kept[0]!)) allOf.push(kept[0]!);
      continue;
    }
    // A group already implied by allOf carries no information.
    if (kept.some((c) => allOf.includes(c))) continue;
    oneOf.push(kept);
  }

  if (allOf.length === 0 && oneOf.length === 0 && coreq.length === 0) return null;
  return { allOf, oneOf, minGrade: rule.minGrade, coreq };
}

async function runBatch(
  batch: Course[],
  index: number,
  stats: Stats,
): Promise<PrereqBatch["rules"]> {
  const user =
    FEWSHOT_USER +
    "\n\n--- now do these, same format ---\n\n" +
    batch.map((c) => `${c.code} :: ${c.prereqText}`).join("\n");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // The few-shot pair is folded into the user turn rather than sent as
      // extra messages: callStructured (lib/openai.ts) takes exactly one system
      // and one user string, and widening that signature would touch a file two
      // other routes depend on.
      const raw = await callStructured(
        SYSTEM + "\n\nWorked examples:\n" + FEWSHOT_USER + "\n→\n" + FEWSHOT_ASSISTANT,
        user,
        PrereqBatch,
        "prereq_batch",
      );
      // Structured Outputs guarantees the SHAPE, not that the shape is what we
      // declared in this file's zod object at runtime — parse it for real.
      return PrereqBatch.parse(raw).rules;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  batch ${index} attempt ${attempt} failed: ${msg}`);
      if (attempt === MAX_ATTEMPTS) {
        stats.failedBatches.push(index);
        return [];
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return [];
}

// --compare: the reason this script is worth running at all before trusting it.
function compare(model: PrereqGraph, reference: PrereqGraph): void {
  const norm = (r: PrereqRule) =>
    JSON.stringify({
      allOf: [...r.allOf].sort(),
      oneOf: r.oneOf.map((g) => [...g].sort()).sort(),
      minGrade: r.minGrade,
      coreq: [...r.coreq].sort(),
    });

  const keys = [...new Set([...Object.keys(model), ...Object.keys(reference)])].sort();
  let same = 0;
  const diffs: string[] = [];
  for (const k of keys) {
    const a = model[k];
    const b = reference[k];
    if (a && b && norm(a) === norm(b)) {
      same += 1;
      continue;
    }
    diffs.push(
      `  ${k}\n    model : ${a ? norm(a) : "(no rule)"}\n    parser: ${b ? norm(b) : "(no rule)"}`,
    );
  }

  console.log("\n---- model vs. deterministic parser --------------------------");
  console.log(`identical   ${same} / ${keys.length}`);
  console.log(`differing   ${diffs.length}`);
  if (diffs.length) console.log(diffs.join("\n"));
  console.log(
    "\nThe parser is the reference because it reproduces §9.2's two verified\n" +
      "ground-truth strings exactly (asserted by scripts/parse-prereqs.ts).\n" +
      "Nothing was written.",
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const compareOnly = argv.includes("--compare");
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;

  // Checked HERE, not at import time. lib/openai.ts constructs its client
  // lazily for exactly this reason: `new OpenAI()` throws synchronously on a
  // missing key, and at module scope that turns a clear message into a stack
  // trace before main() ever runs.
  if (!process.env.OPENAI_API_KEY) {
    console.error("build-prereqs needs OPENAI_API_KEY and it is not set.\n");
    console.error("  bash :  OPENAI_API_KEY=sk-... npx tsx scripts/build-prereqs.ts");
    console.error('  pwsh :  $env:OPENAI_API_KEY="sk-..."; npx tsx scripts/build-prereqs.ts\n');
    console.error("tsx does not read .env.local — only `next dev` does.\n");
    console.error(
      "You do NOT need a key to have a prereq graph: data/prereqs.json is\n" +
        "already committed, built by scripts/parse-prereqs.ts, which is\n" +
        "deterministic, offline, and free. Run that instead:\n" +
        "  npx tsx scripts/parse-prereqs.ts && npx tsx scripts/verify-prereqs.ts",
    );
    process.exit(1);
  }

  const courses = JSON.parse(readFileSync(COURSES_PATH, "utf8")) as Course[];
  const catalog = new Set(courses.map((c) => c.code));
  const withText = courses.filter((c) => c.prereqText && c.prereqText.trim());

  const batches: Course[][] = [];
  for (let i = 0; i < withText.length; i += BATCH_SIZE) {
    batches.push(withText.slice(i, i + BATCH_SIZE));
  }

  console.log("build-prereqs — CLAUDE.md §9.2 (gpt-4o-2024-11-20)\n");
  console.log(`prereq blocks  ${withText.length}`);
  console.log(`batches        ${batches.length} × ${BATCH_SIZE}`);
  console.log(compareOnly ? "mode           --compare (writes nothing)\n" : "\n");

  const stats: Stats = {
    droppedCodes: new Map(),
    emptiedGroups: 0,
    missingRules: [],
    unexpectedRules: [],
    failedBatches: [],
  };

  const wire: PrereqBatch["rules"] = [];
  for (const [i, batch] of batches.entries()) {
    process.stdout.write(`batch ${i + 1}/${batches.length} (${batch[0]!.code}…)  `);
    const rules = await runBatch(batch, i + 1, stats);
    console.log(`${rules.length} rules`);

    const asked = new Set(batch.map((c) => c.code));
    const got = new Set(rules.map((r) => r.code));
    for (const code of asked) if (!got.has(code)) stats.missingRules.push(code);
    for (const code of got) if (!asked.has(code)) stats.unexpectedRules.push(code);

    wire.push(...rules);
  }

  // §9.2, verbatim: the model returns { rules: [...] } and the script folds it.
  // Sanitising first means a hallucinated code can never reach the fold.
  const cleaned = wire
    .filter((r) => catalog.has(r.code))
    .map((r) => [r.code, sanitise(r, catalog, stats)] as const)
    .filter((entry): entry is readonly [string, PrereqRule] => entry[1] !== null);
  const graph: PrereqGraph = Object.fromEntries(cleaned);

  const dropped = [...stats.droppedCodes.values()].reduce((a, b) => a + b, 0);
  console.log("\n---- validation ----------------------------------------------");
  console.log(`rules kept                 ${Object.keys(graph).length}`);
  console.log(`codes dropped (not in catalog) ${dropped} across ${stats.droppedCodes.size} distinct`);
  if (stats.droppedCodes.size) {
    console.log(
      "  " +
        [...stats.droppedCodes]
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `${c}×${n}`)
          .join("  "),
    );
  }
  console.log(`oneOf groups emptied by validation ${stats.emptiedGroups}`);
  console.log(`courses the model skipped  ${stats.missingRules.length}${stats.missingRules.length ? " → " + stats.missingRules.join(", ") : ""}`);
  console.log(`rules for unasked courses  ${stats.unexpectedRules.length}${stats.unexpectedRules.length ? " → " + stats.unexpectedRules.join(", ") : ""}`);
  console.log(`failed batches             ${stats.failedBatches.length}${stats.failedBatches.length ? " → " + stats.failedBatches.join(", ") : ""}`);

  if (compareOnly) {
    const reference = JSON.parse(readFileSync(DEFAULT_OUT, "utf8")) as PrereqGraph;
    compare(graph, reference);
    return;
  }

  if (stats.failedBatches.length > 0) {
    console.error(
      `\n${stats.failedBatches.length} batch(es) failed. Writing now would ship a ` +
        "graph with silent holes in it, and §11.3 reads a missing rule as " +
        '"no prerequisites" — the failure would surface as a schedule card ' +
        "recommending a course the student cannot register for. Fix and re-run.",
    );
    process.exit(1);
  }

  const target = outPath ?? DEFAULT_OUT;
  const ordered: PrereqGraph = {};
  for (const code of Object.keys(graph).sort()) ordered[code] = graph[code]!;
  writeFileSync(target, JSON.stringify(ordered, null, 2) + "\n", "utf8");
  console.log(`\nwrote ${target}`);
  if (target === DEFAULT_OUT) {
    console.log(
      "This OVERWROTE the deterministic graph. Verify it before committing:\n" +
        "  npx tsx scripts/verify-prereqs.ts\n" +
        "To restore the deterministic one:\n" +
        "  npx tsx scripts/parse-prereqs.ts",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
