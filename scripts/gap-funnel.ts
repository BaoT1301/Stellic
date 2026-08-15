import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSkillGaps, type DemandedSkill } from "../lib/gaps";
import { remainingRequired } from "../lib/bottlenecks";
import type { CatalogSkills, Course, PrereqGraph, Skill, StudentAudit } from "../lib/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = <T,>(p: string): T => JSON.parse(readFileSync(path.join(root, p), "utf8")) as T;

async function main() {
  const courses = read<Course[]>("data/courses.json");
  const prereqs = read<PrereqGraph>("data/prereqs.json");
  const catalogSkills = read<CatalogSkills>("data/catalog-skills.json");
  const onet = read<Skill[]>("data/onet-dwa.json");
  const audit = read<{ "parse-audit": { audit: StudentAudit } }>("samples/fallback-response.json")["parse-audit"].audit;

  const postings = [
    readFileSync(path.join(root, "samples/sample-job-swe.txt"), "utf8"),
    readFileSync(path.join(root, "samples/sample-job-data.txt"), "utf8"),
  ];
  console.log("POSTINGS");
  postings.forEach((p, i) => console.log(`  ${i}: ${p.trim().split(/\s+/).length} words`));

  // How big is the vocabulary extract-skills is allowed to choose from?
  const scoped = new Set<string>();
  for (const list of Object.values(catalogSkills)) for (const h of list ?? []) scoped.add(h.skillId);
  console.log(`\nSCOPED DWA VOCABULARY: ${scoped.size} of ${onet.length} O*NET activities`);
  console.log("  (extract-skills may only return ids from this set)");

  const res = await fetch("http://localhost:3407/api/extract-skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postings }),
  });
  const json = (await res.json()) as { skills: DemandedSkill[]; degraded: boolean };
  console.log(`\nEXTRACTED: ${json.skills.length} skills (degraded=${json.degraded})`);
  for (const s of json.skills) console.log(`  ${s.demandCount}x  ${s.skillName}`);

  const gaps = computeSkillGaps(json.skills, audit, catalogSkills, prereqs, courses);
  const covered = gaps.filter((g) => g.covered);
  const reachable = gaps.filter((g) => !g.covered && g.closableBy.length > 0);
  const blocked = gaps.filter((g) => !g.covered && g.closableBy.length === 0);

  console.log(`\nFUNNEL:  demanded ${gaps.length}  ->  covered ${covered.length} | reachable ${reachable.length} | blocked ${blocked.length}`);
  console.log("\nCOVERED (already taught by a course they must take anyway):");
  for (const g of covered) console.log(`  ${g.skillName}\n      by ${g.coveredBy.slice(0, 4).join(", ")}`);
  console.log("\nREACHABLE (an elective could close this):");
  for (const g of reachable) console.log(`  ${g.skillName}\n      via ${g.closableBy.slice(0, 6).join(", ")}`);
  console.log("\nBLOCKED (needs a prereq first):");
  for (const g of blocked) console.log(`  ${g.skillName}`);

  const req = new Set(remainingRequired(audit));
  console.log(`\nstill-required courses counting as "covered": ${[...req].join(", ")}`);
}

void main();
