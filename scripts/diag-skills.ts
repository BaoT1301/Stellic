/**
 * Replays /api/extract-skills against the live API and prints the RAW model
 * output alongside each of the route's two filters, so a
 * "model returned no usable skills" can be attributed rather than guessed at.
 *
 *   OPENAI_API_KEY=... npx tsx scripts/diag-skills.ts
 *
 * Read-only. Calls the model, writes nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isUndergraduate } from "../lib/bottlenecks";
import { callStructured } from "../lib/openai";
import { extractedSkillsSchema, type ExtractedSkills } from "../lib/schemas";
import type { CatalogSkills, Skill } from "../lib/types";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const catalogSkills = JSON.parse(read("data/catalog-skills.json")) as CatalogSkills;
const onetDwa = JSON.parse(read("data/onet-dwa.json")) as Skill[];

const dwaNameById = new Map(onetDwa.map((d) => [d.skillId, d.skillName]));

const scopedSkills: Skill[] = (() => {
  const ids = new Set<string>();
  for (const code of Object.keys(catalogSkills)) {
    if (!isUndergraduate(code)) continue;
    for (const s of catalogSkills[code] ?? []) ids.add(s.skillId);
  }
  return [...ids]
    .map((skillId) => ({ skillId, skillName: dwaNameById.get(skillId) ?? "" }))
    .filter((s) => s.skillName !== "")
    .sort((a, b) => a.skillName.localeCompare(b.skillName));
})();

const scopedIdByName = new Map(scopedSkills.map((s) => [s.skillName, s.skillId]));

// Lifted verbatim from app/api/extract-skills/route.ts so the diagnosis is of
// the real prompt. If that file's rules change, re-copy this.
const SYSTEM = `You read job postings and identify which O*NET Detailed Work Activities (DWAs) each posting is asking for.

You are given a fixed catalog of allowed DWAs below. Follow these rules exactly:

1. Return ONLY skillId values that appear verbatim in the allowed list. Never invent an id, never modify an id, never return a DWA that is not on the list.
2. Copy skillName verbatim from the list, including its trailing period.
3. For each skill you return, "postings" is the list of ZERO-BASED indices of the postings that asked for it. A posting counts if it names the activity in its responsibilities, its qualifications, or its preferred qualifications.
4. "demandCount" is the number of entries in "postings".
5. One entry per distinct skill. Do not emit the same skillId twice — merge the indices instead.
6. Judge on substance, not vocabulary. "Write SQL against our warehouse daily" is database work; "defend a confidence interval" is statistical analysis; "read a query plan" is not the same activity as "build a dashboard".
7. Return AT MOST 20 skills. There is NO MINIMUM. Six precise activities beat twelve where six were forced. Prefer the activities the postings actually spend words on.
8. If a requirement has no genuine match in the allowed list, OMIT it. Never settle for the nearest available id. A wrong match is far worse than a missing one: each returned skill is what the schedule builder then tries to close, so one bad mapping puts an unrelated course on the student's schedule with a real CRN next to it.
9. Never map a technical requirement onto an activity from an unrelated professional domain — creative writing, construction, food service, healthcare, performing arts — merely because a word overlaps. "Builds data pipelines" is not "Prepare production storyboards." If the closest allowed activity comes from a different domain than the posting, that is a signal to OMIT, not to match.

ALLOWED DWAs (skillId<TAB>skillName):
${scopedSkills.map((s) => `${s.skillId}\t${s.skillName}`).join("\n")}`;

async function main() {
  const postings = [
    read("public/samples/sample-job-swe.txt"),
    read("public/samples/sample-job-data.txt"),
  ];

  const kept = postings
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((p) => p.text.length > 0);

  const user = kept
    .map((p) => `### POSTING INDEX ${p.index}\n${p.text.slice(0, 8_000)}`)
    .join("\n\n");

  console.log("scoped DWAs offered to the model :", scopedSkills.length);
  console.log(
    "system prompt                    :",
    SYSTEM.length,
    "chars  (~" + Math.round(SYSTEM.length / 4) + " tokens)",
  );
  console.log("postings sent                    :", kept.length, "at indices", kept.map((k) => k.index));
  console.log("user message                     :", user.length, "chars\n");

  const result = await callStructured<ExtractedSkills>(
    SYSTEM,
    `${user}\n\nReturn the DWAs these postings ask for, using the zero-based POSTING INDEX values shown above.`,
    extractedSkillsSchema,
    "extracted_skills",
  );

  const raw = result.skills ?? [];
  console.log(`RAW model skills: ${raw.length}\n`);

  const validIndices = new Set(kept.map((p) => p.index));
  let outOfScope = 0;
  let badIndices = 0;

  for (const s of raw) {
    const id = scopedIdByName.get((s.skillName ?? "").trim());
    const idx = (s.postings ?? []).filter((i) => validIndices.has(i));
    if (!id) outOfScope++;
    else if (idx.length === 0) badIndices++;
    const verdict = !id ? "INVENTED" : idx.length === 0 ? "DROP idx" : "keep    ";
    console.log(
      `  ${verdict}  postings=${JSON.stringify(s.postings ?? [])}  ${(s.skillName ?? "").slice(0, 60)}`,
    );
  }

  const kept2 = raw.length - outOfScope - badIndices;
  console.log(`\n  dropped, name not in allowed list   : ${outOfScope}`);
  console.log(`  dropped, no valid posting index     : ${badIndices}`);
  console.log(`  SURVIVING                           : ${kept2}`);
  if (kept2 === 0) {
    console.log("\n  -> this is the 'model returned no usable skills' path.");
  }
}

main().catch((err) => {
  console.error("\ncallStructured threw:", err instanceof Error ? err.message : err);
  process.exit(1);
});
