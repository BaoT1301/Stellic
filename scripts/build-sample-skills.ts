/**
 * Memoises the skill extraction for the two COMMITTED sample postings.
 *
 * WHY THIS EXISTS. /api/extract-skills asks a model to pick O*NET activities out
 * of a posting, and that is a judgement call, so it returns a slightly different
 * set every run. Measured across three consecutive runs on the same two sample
 * postings: 5, 8 and 7 skills. Everything downstream is computed from that set,
 * so the schedule cards report a different "N of M job skills" each time, and one
 * unlucky run reported "0 of 1", which reads as a product that found nothing.
 *
 * §16 says to record the demo with sample data pre-loaded and not to make live
 * API calls on camera. This is that, made real: the answer below is a genuine
 * extraction of these exact postings, captured once and committed, so the sample
 * path is identical every time a judge opens the link.
 *
 * A student pasting their OWN posting still gets a live call. The cache is keyed
 * on an exact normalised match against the committed samples and nothing else.
 *
 * Regenerate:  npx tsx scripts/build-sample-skills.ts   (server must be running)
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3407";
/** Odd number so a strict majority is unambiguous. */
const RUNS = 5;

interface Skill {
  skillId: string;
  skillName: string;
  demandCount: number;
  postings: number[];
}

/** Must stay byte-identical to the normaliser in app/api/extract-skills/route.ts. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

async function main() {
  const postings = [
    readFileSync(path.join(root, "samples/sample-job-swe.txt"), "utf8"),
    readFileSync(path.join(root, "samples/sample-job-data.txt"), "utf8"),
  ];

  // CONSENSUS, not "the run with the most skills".
  //
  // Selecting by count was actively wrong: it rewards the junkiest run. The
  // first attempt at this picked a run containing "Analyze environmental
  // regulations to ensure organizational compliance" and "Maintain the order of
  // legal documents" for a backend engineering posting and a data science
  // posting, because a longer list is a list that reached further from the text.
  //
  // A skill the model returns on MOST independent runs is one the posting really
  // asks for. A cross-domain false match appears once and then does not come
  // back. Majority voting across runs is therefore both more stable and more
  // accurate than any single run, and every skill kept is one the model returned
  // for these exact postings.
  const runs: Skill[][] = [];
  for (let i = 0; i < RUNS; i++) {
    const res = await fetch(`${BASE}/api/extract-skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postings, noCache: true }),
    });
    const json = (await res.json()) as { skills: Skill[]; degraded: boolean };
    if (json.degraded) throw new Error(`run ${i + 1} came back degraded; is OPENAI_API_KEY set?`);
    console.log(`  run ${i + 1}: ${json.skills.length} skills`);
    runs.push(json.skills);
  }

  // Count how many runs returned each skill, and union the posting indices it
  // was attributed to on the runs that did return it.
  const seen = new Map<string, { skill: Skill; runs: number; postings: Set<number> }>();
  for (const run of runs) {
    const uniqueThisRun = new Set(run.map((s) => s.skillId));
    for (const s of run) {
      const entry = seen.get(s.skillId) ?? { skill: s, runs: 0, postings: new Set<number>() };
      for (const p of s.postings) entry.postings.add(p);
      seen.set(s.skillId, entry);
    }
    for (const id of uniqueThisRun) seen.get(id)!.runs += 1;
  }

  const quorum = Math.floor(RUNS / 2) + 1;
  const kept = [...seen.values()].filter((e) => e.runs >= quorum);
  const dropped = [...seen.values()].filter((e) => e.runs < quorum);

  console.log(`\nquorum: a skill must appear in >= ${quorum} of ${RUNS} runs`);
  if (dropped.length > 0) {
    console.log("dropped as one-off (this is the junk filter working):");
    for (const d of dropped.sort((a, b) => b.runs - a.runs)) {
      console.log(`  ${d.runs}/${RUNS}  ${d.skill.skillName}`);
    }
  }

  const best: Skill[] = kept
    .map((e) => ({
      skillId: e.skill.skillId,
      skillName: e.skill.skillName,
      postings: [...e.postings].sort((a, b) => a - b),
      demandCount: e.postings.size,
    }))
    .sort((a, b) => b.demandCount - a.demandCount || a.skillName.localeCompare(b.skillName));

  if (best.length === 0) throw new Error("no skill reached quorum; check the prompt");
  const out = {
    _note:
      "Captured from a live /api/extract-skills call on the two committed sample postings. Regenerate with scripts/build-sample-skills.ts. Serves the sample path deterministically; a pasted posting still calls the model.",
    // The normalised posting text is stored HERE rather than read from
    // samples/*.txt at runtime, because a .txt import is not bundled by Next and
    // an fs read of a path outside the traced output is exactly the §6 trap.
    // One JSON import gives the route both the key and the value.
    postings: postings.map(normalise),
    skills: best,
  };

  writeFileSync(
    path.join(root, "samples/sample-skills.json"),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(`\nwrote samples/sample-skills.json with ${best.length} skills:`);
  for (const s of best) console.log(`  ${s.demandCount}x  ${s.skillName}`);
}

void main();
