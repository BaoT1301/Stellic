// scripts/embed-skills.ts — CLAUDE.md §9.4
//
// courses.json × onet-dwa.json → data/catalog-skills.json (CatalogSkills).
//
// Run:  npx tsx scripts/embed-skills.ts        (cwd = repo root, needs OPENAI_API_KEY)
//
// This is the REAL pipeline. It is the only thing in the project that calls the
// embeddings endpoint, it runs offline (§6: "everything expensive happens offline
// at build time"), and its output is committed so the deployed app does zero ML.
//
// §9.4, in order:
//   1. embed every DWA name with text-embedding-3-small
//   2. sentence-split each course description, embed the title and each sentence
//      separately, score = MAX across them   (Syllabus2O*NET's actual method:
//      segmentation → per-sentence cosine → max per skill; also kills the length
//      bias, which is real here — descriptions run 26 to 158 words)
//   3. cosine similarity, course × skill
//   4. MEAN-CENTER PER DWA — the highest-value step in the section
//   5. top-15 per course kept at a RELATIVE margin (0.6 × that course's max),
//      NOT an absolute 0.35 threshold
//   6. write data/catalog-skills.json
//
// Everything from step 2 onward is exported, because scripts/map-skills-lexical.ts
// (the deterministic no-API fallback that produced the currently committed file)
// imports it. Sharing the code rather than copying it is the point: the fallback
// and the real run must select chips the same way, or every downstream consumer
// — §11.2's gap map, §11.3's gapValue — changes behaviour the day a key appears.
//
// NOTE ON RUNTIME: step 3 is a 4k × 2k × 1536 dense product (~13 GFLOP). Plain JS
// over Float32Array does that in tens of seconds. Offline scripts are allowed to
// be slow and ugly (§6); runtime code is not.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import OpenAI from "openai";

import type { CatalogSkills, Course, Skill } from "@/lib/types";

const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const COURSES_FILE = path.join(DATA_DIR, "courses.json");
const SKILLS_FILE = path.join(DATA_DIR, "onet-dwa.json");
const OUT_FILE = path.join(DATA_DIR, "catalog-skills.json");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "embeddings");

export const EMBED_MODEL = "text-embedding-3-small";

// §9.4 step 5. Rank + relative margin, deliberately scale-free: it retires the
// threshold-tuning step, and it survives the swap from lexical cosine (this
// file's fallback sibling) to embedding cosine without retuning.
export const TOP_K = 15;
export const RELATIVE_MARGIN = 0.6;

// The embeddings endpoint accepts arrays; §9.4 says batch ~100 and cache by
// content hash so re-runs are free. 100 short strings is nowhere near the 300k
// token per-request ceiling.
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function loadCourses(): Course[] {
  const courses: Course[] = JSON.parse(fs.readFileSync(COURSES_FILE, "utf8"));
  if (!Array.isArray(courses) || courses.length === 0) {
    throw new Error(`no courses in ${COURSES_FILE} — run scrape-catalog.ts first`);
  }
  return courses;
}

export function loadSkills(): Skill[] {
  const skills: Skill[] = JSON.parse(fs.readFileSync(SKILLS_FILE, "utf8"));
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error(`no DWAs in ${SKILLS_FILE} — run fetch-onet.ts first`);
  }
  return skills;
}

// ---------------------------------------------------------------------------
// §9.4 step 2 — segmentation
// ---------------------------------------------------------------------------

// Registrar administrivia. Every one of the 689 scraped descriptions ends with
// "Offered by <department>."; 420 carry a repeat-for-credit rule and 308 an
// attempt limit. None of it describes what the student learns to DO, and it is
// IDENTICAL across courses — which is exactly the fuel that makes one DWA rank
// for every course (§9.4's hubness failure). Mean-centering would eventually
// absorb it, but there is no reason to spend an embedding on it or to let it win
// a max() over a real content sentence.
const BOILERPLATE = [
  /^offered by\b/i, // 689 of 689
  /^(may|cannot|can ?not) ?(not )?be (repeated|used)\b/i,
  /^limited to \w+ attempts?\b/i,
  /^notes?:/i, // repeat rules, department-permission notes, grade minimums
  /^equivalent to\b/i,
  /^students? (must|may) (register|receive|attain|not)\b/i,
  /^(recommended |required )?(co)?prerequisites?:/i,
  /permission of (the )?(department|instructor)/i,
  /^this course (is|was) (cross-?listed|equivalent)/i,
];

function isBoilerplate(sentence: string): boolean {
  return BOILERPLATE.some((re) => re.test(sentence));
}

/**
 * §9.4 step 2: title + one segment per description sentence, split on
 * `/(?<=[.!?])\s+/`. Score is the MAX over these, never the mean, so a course
 * that mentions a skill in one sentence out of nine is not punished for being
 * verbose.
 *
 * Segments are returned in order with the title first; callers only ever max
 * over them, so the order is cosmetic (it makes the cache log readable).
 */
export function courseSegments(course: Course): string[] {
  const segments: string[] = [];
  const title = course.title.trim();
  if (title) segments.push(title);

  for (const raw of (course.description ?? "").split(/(?<=[.!?])\s+/)) {
    const sentence = raw.replace(/ /g, " ").replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    if (isBoilerplate(sentence)) continue;
    // A one-word fragment ("Prerequisites.") carries no signal but can score a
    // freakishly high cosine against a short DWA title purely on length.
    if (sentence.split(/\s+/).length < 3) continue;
    segments.push(sentence);
  }

  // Degenerate case: a course whose description is entirely boilerplate still
  // has to appear in the output, or §11.2 silently loses it from `closableBy`.
  if (segments.length === 0) segments.push(course.code + " " + course.title);
  return segments;
}

// ---------------------------------------------------------------------------
// §9.4 steps 4 + 5 — mean-centering and relative-margin selection
// ---------------------------------------------------------------------------

/**
 * §9.4 STEP 4 — mean-center per DWA. `raw[c * nSkills + s]` is the similarity of
 * course c to DWA s, already maxed over that course's segments (step 3).
 *
 * `s' = s − mean(that DWA across the scoped catalog)`, where the mean is taken
 * over EVERY course including the ones scoring ~0. That is what makes the
 * correction work: a hub like "Prepare reports." scores moderately against all
 * 689 courses, so its mean is high and centering wipes it out, while a
 * specialist DWA scores ~0 almost everywhere, keeps a mean near zero, and
 * survives centering intact wherever it actually fires.
 */
export function meanCenterPerSkill(
  raw: Float64Array,
  nCourses: number,
  nSkills: number,
): Float64Array {
  const centered = new Float64Array(raw.length);
  for (let s = 0; s < nSkills; s++) {
    let sum = 0;
    for (let c = 0; c < nCourses; c++) sum += raw[c * nSkills + s]!;
    const mean = sum / nCourses;
    for (let c = 0; c < nCourses; c++) {
      centered[c * nSkills + s] = raw[c * nSkills + s]! - mean;
    }
  }
  return centered;
}

/**
 * §9.4 STEP 5 — per course, keep the top 15 whose centered score is at least
 * RELATIVE_MARGIN × that course's best centered score. Rank plus a relative
 * margin, never an absolute similarity threshold.
 *
 * Emitted `score` is the centered score divided by the largest centered score in
 * the whole catalog, so it lands in (0,1] as §8 promises ("match confidence
 * 0–1") AND stays comparable ACROSS courses — §11.3's gapValue sums
 * `demandCount × score` over different courses, so a per-course normalization
 * (every course's best chip = 1.0) would flatten exactly the signal it needs.
 */
export function selectTopK(
  centered: Float64Array,
  courses: Course[],
  skills: Skill[],
  /**
   * Optional GLOBAL floor on the emitted (0,1] score, applied after rescaling.
   *
   * Zero for the embedding path — §9.4's rank-plus-relative-margin is
   * deliberately scale-free and needs no absolute threshold. The lexical
   * fallback passes a real value because TF-IDF has a measurable junk boundary
   * that embeddings do not: correct matches land at 0.25–1.00 while stem
   * collisions ("Move large objects using heavy equipment." for CS 310, which
   * matched on "structures") sit at 0.03–0.19. The per-course relative margin
   * cannot cut those, because a course whose BEST match is junk still clears
   * its own margin. A global floor can.
   */
  scoreFloor = 0,
): CatalogSkills {
  const nCourses = courses.length;
  const nSkills = skills.length;

  // Pass 1: pick the survivors per course.
  const picked: { code: string; hits: { skillId: string; score: number }[] }[] = [];
  let globalMax = 0;

  for (let c = 0; c < nCourses; c++) {
    const row: { idx: number; score: number }[] = [];
    let best = -Infinity;
    for (let s = 0; s < nSkills; s++) {
      const v = centered[c * nSkills + s]!;
      if (v > best) best = v;
      row.push({ idx: s, score: v });
    }
    // A course whose every centered score is <= 0 is more generic than the
    // catalog average on every single DWA. Emit nothing rather than 15 chips of
    // noise — §11.2 handles an empty list, a wrong list it cannot handle.
    if (!(best > 0)) {
      picked.push({ code: courses[c]!.code, hits: [] });
      continue;
    }
    const floor = RELATIVE_MARGIN * best;
    const hits = row
      .filter((r) => r.score >= floor)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
    if (hits[0] && hits[0].score > globalMax) globalMax = hits[0].score;
    picked.push({
      code: courses[c]!.code,
      hits: hits.map((h) => ({ skillId: skills[h.idx]!.skillId, score: h.score })),
    });
  }

  // Pass 2: rescale to (0,1] with one global divisor — monotone, so it reorders
  // nothing, within a course or between two courses.
  const out: CatalogSkills = {};
  for (const { code, hits } of picked.sort((a, b) => a.code.localeCompare(b.code))) {
    out[code] = hits
      .map((h) => ({
        skillId: h.skillId,
        score: Math.round((h.score / (globalMax || 1)) * 1e4) / 1e4,
      }))
      .filter((h) => h.score >= scoreFloor);
  }
  return out;
}

/**
 * The top `k` DWAs per course by centered score with NO margin applied — i.e.
 * the literal "top-15 list" §9.4's sanity gate talks about.
 *
 * This exists only for the gate, and it matters: selectTopK's relative margin
 * often trims a course to two or three chips, and two three-item lists trivially
 * fail to overlap. Testing the untrimmed rank-15 is the test that can actually
 * catch hubness. Never write this to disk.
 */
export function rankTopK(
  centered: Float64Array,
  courses: Course[],
  skills: Skill[],
  k = TOP_K,
): Record<string, string[]> {
  const nSkills = skills.length;
  const out: Record<string, string[]> = {};
  for (let c = 0; c < courses.length; c++) {
    const row: { idx: number; score: number }[] = [];
    for (let s = 0; s < nSkills; s++) row.push({ idx: s, score: centered[c * nSkills + s]! });
    out[courses[c]!.code] = row
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((r) => skills[r.idx]!.skillId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Hand-rolled serializer: one skill per line. `JSON.stringify(x, null, 2)` puts
 * skillId and score on separate lines, which triples the file and makes the diff
 * unreadable when the mapping is regenerated.
 *
 * The file is EXACTLY a CatalogSkills map — no provenance key, no version key.
 * §8 is frozen and `Record<string, {skillId, score}[]>` is what the app imports.
 */
export function writeCatalogSkills(catalogSkills: CatalogSkills): void {
  const codes = Object.keys(catalogSkills).sort((a, b) => a.localeCompare(b));
  const body = codes
    .map((code) => {
      const rows = catalogSkills[code]!.map(
        (h) => `    { "skillId": ${JSON.stringify(h.skillId)}, "score": ${h.score} }`,
      );
      return `  ${JSON.stringify(code)}: [\n${rows.join(",\n")}\n  ]`;
    })
    .join(",\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `{\n${body}\n}\n`, "utf8");
  console.log(`  wrote   : ${OUT_FILE}`);
}

// ---------------------------------------------------------------------------
// §9.4 SANITY GATE
// ---------------------------------------------------------------------------

const GATE_A = "CS 484"; // Data Mining
const GATE_B = "ENGH 302"; // Advanced Composition
const MAX_OVERLAP = 3;

// The data-mining course must surface analysis / statistics / data work. If it
// does not, the mapping is not merely hubby — it is not reading the description.
const DATA_WORDS = /\b(data|analy|statistic|research|comput|inform|model|report)/i;

/**
 * §9.4: "Printing the top skills for CS 484 and ENGH 302 passes even under total
 * hubness collapse. Keep the print, and add the check that actually catches it:
 * assert the two top-15 lists overlap by no more than ~3 items."
 *
 * Checked TWICE, on purpose:
 *   1. the chips actually written to disk — what the UI renders;
 *   2. the untrimmed rank-15 from rankTopK — because the relative margin often
 *      leaves a course with three chips, and two three-item lists cannot overlap
 *      by four no matter how collapsed the space is. (2) is the real test.
 *
 * Throws on failure — both entry points let that hit the top-level catch and
 * exit non-zero, so a collapsed mapping is not committable (same posture as
 * §9.5's verify-prereqs).
 */
export function sanityGate(
  catalogSkills: CatalogSkills,
  skills: Skill[],
  ranked: Record<string, string[]>,
): void {
  const name = new Map(skills.map((s) => [s.skillId, s.skillName]));

  const show = (code: string) => {
    const hits = catalogSkills[code];
    if (!hits) throw new Error(`sanity gate: ${code} missing from the mapping`);
    console.log(`\n  ${code} — ${hits.length} chip(s) written:`);
    for (const h of hits) {
      console.log(`    ${h.score.toFixed(4)}  ${name.get(h.skillId) ?? h.skillId}`);
    }
    const top = ranked[code];
    if (!top) throw new Error(`sanity gate: ${code} missing from the ranking`);
    console.log(`  ${code} — untrimmed rank-${top.length}:`);
    for (const id of top) console.log(`      ${name.get(id) ?? id}`);
    return { hits, top };
  };

  const a = show(GATE_A);
  const b = show(GATE_B);

  const bIds = new Set(b.hits.map((h) => h.skillId));
  const shared = a.hits.filter((h) => bIds.has(h.skillId));
  console.log(
    `\n  overlap ${GATE_A} ∩ ${GATE_B}, written chips: ${shared.length}` +
      ` (max allowed ${MAX_OVERLAP})`,
  );
  for (const h of shared) console.log(`    · ${name.get(h.skillId) ?? h.skillId}`);

  const bTop = new Set(b.top);
  const sharedTop = a.top.filter((id) => bTop.has(id));
  console.log(
    `  overlap ${GATE_A} ∩ ${GATE_B}, untrimmed rank-${TOP_K}: ${sharedTop.length}` +
      ` (max allowed ${MAX_OVERLAP})`,
  );
  for (const id of sharedTop) console.log(`    · ${name.get(id) ?? id}`);

  if (sharedTop.length > MAX_OVERLAP) {
    throw new Error(
      `sanity gate FAILED: the untrimmed top-${TOP_K} lists for ${GATE_A} and ` +
        `${GATE_B} share ${sharedTop.length} skills (max ${MAX_OVERLAP}). The ` +
        `similarity space has collapsed into hubness — re-check the mean-centering ` +
        `in meanCenterPerSkill() before anything downstream trusts this file.`,
    );
  }

  if (shared.length > MAX_OVERLAP) {
    throw new Error(
      `sanity gate FAILED: the chips WRITTEN for ${GATE_A} and ${GATE_B} share ` +
        `${shared.length} skills (max ${MAX_OVERLAP}). Every course will render the ` +
        `same chips and §2's "choosing" thesis dies on camera.`,
    );
  }

  const topical = a.hits.filter((h) => DATA_WORDS.test(name.get(h.skillId) ?? ""));
  if (topical.length === 0) {
    throw new Error(
      `sanity gate FAILED: ${GATE_A} (Data Mining) surfaced no analysis/statistics/` +
        `data work activity. The mapping is not reading the description.`,
    );
  }
  console.log(
    `  ${GATE_A} data/analysis-flavoured chips: ${topical.length}/${a.hits.length}`,
  );
}

/** Coverage numbers worth eyeballing before anything downstream consumes this. */
export function printCoverage(catalogSkills: CatalogSkills, skills: Skill[]): void {
  const codes = Object.keys(catalogSkills);
  const counts = codes.map((c) => catalogSkills[c]!.length);
  const empty = counts.filter((n) => n === 0).length;
  const used = new Map<string, number>();
  for (const c of codes) {
    for (const h of catalogSkills[c]!) used.set(h.skillId, (used.get(h.skillId) ?? 0) + 1);
  }
  const hubbiest = [...used.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  console.log(`\n  courses          : ${codes.length}  (${empty} with no skills)`);
  console.log(
    `  chips per course : mean ${(counts.reduce((s, n) => s + n, 0) / codes.length).toFixed(1)}` +
      `, min ${Math.min(...counts)}, max ${Math.max(...counts)}`,
  );
  // §12.2 passes exactly this set to the extract-skills prompt, not all 2,070 —
  // a demanded skill no scoped course teaches can never reach SkillGap.closableBy.
  console.log(
    `  distinct DWAs    : ${used.size} of ${skills.length} (this is §12.2's prompt scope)`,
  );
  console.log("  most-shared DWA  :");
  for (const [id, n] of hubbiest) {
    console.log(`    ${String(n).padStart(4)} courses  ${id}`);
  }
}

// ---------------------------------------------------------------------------
// OpenAI embeddings (this half runs ONLY with a key)
// ---------------------------------------------------------------------------

/**
 * `.env.local` is read by Next.js for the app, but a tsx script gets nothing.
 * Ten lines here beats "why is my key undefined" on a hackathon deadline.
 */
function loadDotEnvLocal(): void {
  const file = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue; // a real env var always wins
    process.env[key] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

function cacheKey(text: string): string {
  // Hash the model in too: swapping to text-embedding-3-large must miss, not
  // silently return 1536-dim vectors from the small model.
  return createHash("sha256").update(EMBED_MODEL + "\n" + text).digest("hex");
}

/**
 * Embeds every distinct string once, batching up to BATCH_SIZE per request and
 * caching by content hash (§9.4). The cache is JSONL appended after each batch,
 * so a crash or a rate-limit halfway through 6,000 inputs costs only the batch
 * in flight. `.cache/` is gitignored — this is a local accelerator, not data.
 */
async function embedAll(texts: string[]): Promise<Map<string, Float32Array>> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${EMBED_MODEL}.jsonl`);

  const byHash = new Map<string, Float32Array>();
  if (fs.existsSync(cacheFile)) {
    for (const line of fs.readFileSync(cacheFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { h: string; v: number[] };
        byHash.set(row.h, Float32Array.from(row.v));
      } catch {
        // A torn last line from an interrupted run. Skip it; it will re-embed.
      }
    }
    console.log(`  cache   : ${byHash.size} vectors on disk`);
  }

  const distinct = [...new Set(texts)];
  const missing = distinct.filter((t) => !byHash.has(cacheKey(t)));
  console.log(`  embed   : ${distinct.length} distinct inputs, ${missing.length} uncached`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch });
    // The API returns results in request order, but it also returns `index` —
    // trust the field, not the ordering.
    const rows = [...res.data].sort((x, y) => x.index - y.index);
    const lines: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const text = batch[j]!;
      const vec = rows[j]?.embedding;
      if (!vec) throw new Error(`missing embedding for batch item ${i + j}`);
      const unit = l2Normalize(Float32Array.from(vec));
      const h = cacheKey(text);
      byHash.set(h, unit);
      lines.push(JSON.stringify({ h, v: Array.from(unit) }));
    }
    fs.appendFileSync(cacheFile, lines.join("\n") + "\n", "utf8");
    console.log(`    ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}`);
  }

  const out = new Map<string, Float32Array>();
  for (const t of distinct) out.set(t, byHash.get(cacheKey(t))!);
  return out;
}

/** Unit-normalize so cosine similarity is a plain dot product downstream. */
function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadDotEnvLocal();
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      [
        "",
        "embed-skills: OPENAI_API_KEY is not set — refusing to run.",
        "",
        "  Set it in .env.local at the repo root:",
        "      OPENAI_API_KEY=sk-...",
        "  then re-run:  npx tsx scripts/embed-skills.ts",
        "",
        "  The committed data/catalog-skills.json was produced WITHOUT a key by",
        "  scripts/map-skills-lexical.ts (deterministic TF-IDF, same centering and",
        "  same relative-margin selection). It is provisional. This script",
        "  supersedes it — run it once a key exists and commit the new file.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const courses = loadCourses();
  const skills = loadSkills();
  console.log(`embed-skills: ${courses.length} courses × ${skills.length} DWAs`);

  // §9.4 steps 1 + 2 — one flat list so DWA names and course segments share a
  // single batching pass and a single cache.
  const segmentsByCourse = courses.map(courseSegments);
  const dwaTexts = skills.map((s) => s.skillName);
  const vectors = await embedAll([...dwaTexts, ...segmentsByCourse.flat()]);

  const dim = vectors.get(dwaTexts[0]!)!.length;
  const skillMatrix = new Float32Array(skills.length * dim);
  for (let s = 0; s < skills.length; s++) {
    skillMatrix.set(vectors.get(dwaTexts[s]!)!, s * dim);
  }

  // §9.4 step 3 — cosine (= dot, both sides unit-normalized), maxed over the
  // course's segments.
  console.log("  scoring …");
  const raw = new Float64Array(courses.length * skills.length);
  for (let c = 0; c < courses.length; c++) {
    const row = raw.subarray(c * skills.length, (c + 1) * skills.length);
    row.fill(-Infinity);
    for (const segment of segmentsByCourse[c]!) {
      const v = vectors.get(segment)!;
      for (let s = 0; s < skills.length; s++) {
        let dot = 0;
        const base = s * dim;
        for (let k = 0; k < dim; k++) dot += v[k]! * skillMatrix[base + k]!;
        if (dot > row[s]!) row[s] = dot;
      }
    }
  }

  // §9.4 steps 4–6.
  const centered = meanCenterPerSkill(raw, courses.length, skills.length);
  const catalogSkills = selectTopK(centered, courses, skills);
  writeCatalogSkills(catalogSkills);
  printCoverage(catalogSkills, skills);
  sanityGate(catalogSkills, skills, rankTopK(centered, courses, skills));
  console.log("\n  sanity gate PASSED");
}

// Only run when this file is the thing that was invoked. scripts/map-skills-
// lexical.ts imports the helpers above, and importing must not trip the
// missing-key exit. Comparing basenames (rather than import.meta.url vs
// argv[1]) keeps this working whether tsx loads the file as CJS or ESM.
const invokedAs = path.basename(process.argv[1] ?? "").replace(/\.[cm]?[tj]s$/, "");
if (invokedAs === "embed-skills") {
  main().catch((err) => {
    console.error("\nembed-skills failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
