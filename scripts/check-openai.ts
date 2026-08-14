/**
 * Validates OPENAI_API_KEY and — more importantly — that our zod schemas are
 * actually ACCEPTED by OpenAI's strict Structured Outputs mode.
 *
 * Everything in lib/schemas.ts was written without a key, so it is only known to
 * be structurally legal, not known to be accepted. The specific flagged risk is
 * the `pattern` keyword on expectedGraduation (§12.1): if strict mode rejects
 * it, /api/parse-audit silently falls back to the fixture forever and the demo
 * quietly runs on canned data.
 *
 * Run:  npx tsx scripts/check-openai.ts
 * Costs a fraction of a cent. Exits non-zero on any failure.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callStructured } from "../lib/openai";
import {
  extractedSkillsSchema,
  scheduleProseSchema,
  studentAuditSchema,
} from "../lib/schemas";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Scripts run outside Next, so .env.local is NOT loaded for us. Safe to do at
 * import time: the client in lib/openai.ts is lazy, so nothing has read the key
 * yet. A static import here would explode if it were eager.
 */
function loadEnvLocal() {
  if (process.env.OPENAI_API_KEY) return;
  try {
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
    }
  } catch {
    /* fall through to the check in main() */
  }
}

let failures = 0;

async function trial(name: string, run: () => Promise<unknown>) {
  process.stdout.write(`  ${name.padEnd(28)}`);
  const started = Date.now();
  try {
    const out = await run();
    console.log(`OK   ${Date.now() - started}ms`);
    console.log(
      "      " + JSON.stringify(out).slice(0, 220).replace(/\s+/g, " "),
    );
  } catch (err) {
    failures++;
    console.log("FAIL");
    console.log("      " + (err instanceof Error ? err.message : String(err)));
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set (checked env and .env.local).");
    process.exit(1);
  }

  console.log("\nvalidating the live API against lib/schemas.ts\n");

  await trial("studentAuditSchema", () =>
    callStructured(
      "Extract the student's record. Extract only what is present; invent nothing.",
      "DEGREE EVALUATION\nComputer Science, BS · Catalog 2026-2027\nCredits applied: 86 of 120\nAnticipated Graduation: May 2027\nCompleted: CS 112, CS 211, MATH 125\nStill needed: CS 262, CS 367\nCS Electives: 2 of 4 remaining (6 credits)",
      studentAuditSchema,
      "student_audit",
    ),
  );

  await trial("extractedSkillsSchema", () =>
    callStructured(
      'Extract required skills and map each to the closest id from this list. Return ONLY ids from the list. List: [{"skillId":"4.A.2.a.4.I09.D02","skillName":"Analyze data to identify trends or relationships."},{"skillId":"4.A.3.b.1.I11.D01","skillName":"Write computer programming code."}]',
      "Posting 0: Backend engineer. You will write production services and analyze telemetry to find performance trends.",
      extractedSkillsSchema,
      "extracted_skills",
    ),
  );

  await trial("scheduleProseSchema", () =>
    callStructured(
      "Write one label, one why sentence and one tradeoff sentence per schedule. Be specific and concrete. Do not change any course.",
      "### strategy: max-coverage\n9 credits · clears 1 blocked course · closes 5 of 7 open skills\n- CS 262 Introduction to Low-Level Programming [blocker]\n- CS 484 Data Mining — closes Evaluate data quality\n- STAT 362 Introduction to Computer Statistical Packages",
      scheduleProseSchema,
      "schedule_prose",
    ),
  );

  console.log(
    failures === 0
      ? "\nall schemas accepted by strict mode\n"
      : `\n${failures} schema(s) REJECTED — see errors above\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
