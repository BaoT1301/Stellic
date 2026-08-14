// scripts/map-skills-lexical.ts — PROVISIONAL fallback for CLAUDE.md §9.4
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ THIS IS NOT THE REAL PIPELINE. §9.4 specifies text-embedding-3-small,   │
// │ implemented in scripts/embed-skills.ts. This script exists because      │
// │ there is no OPENAI_API_KEY in the build environment yet, and every      │
// │ downstream consumer — §11.2's gap map, §11.3's gapValue, §12.2's        │
// │ prompt scope — is blocked on data/catalog-skills.json existing.         │
// │                                                                         │
// │ It replaces ONLY §9.4's similarity model — steps 1 and 3 — with a       │
// │ deterministic TF-IDF cosine. The segmentation (step 2), the             │
// │ mean-centring per DWA (step 4) and the top-15-at-a-0.6-relative-margin  │
// │ selection (step 5) are IMPORTED from embed-skills.ts, not               │
// │ reimplemented, so the file this writes has the same shape and the same  │
// │ score scale as the real run and nothing downstream has to change when   │
// │ the real run replaces it.                                               │
// │                                                                         │
// │ SUPERSEDED the moment a key exists:  npx tsx scripts/embed-skills.ts    │
// │ Lexical matching cannot see that "knowledge discovery" and "identify    │
// │ trends in data" are the same activity. Embeddings can. Re-run and       │
// │ re-commit before the demo if at all possible.                           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Run:  npx tsx scripts/map-skills-lexical.ts        (cwd = repo root, no key)
//
// Method, all of it standard IR:
//   - one document per DWA title (2,070) and one per course (689)
//   - lowercase → strip punctuation → drop stopwords → Porter stem → unigrams
//     and adjacent bigrams
//   - tf-idf, tf = 1 + ln(count), idf = ln(N / (1 + df)) + 1, L2-normalized
//   - cosine of each course SEGMENT (title, each description sentence, and one
//     whole-course segment — see main()) against every DWA; course × DWA score
//     = max over segments (§9.4 step 2), and a pair must share at least two
//     terms to count at all
//   - then hand off to meanCenterPerSkill() + selectTopK() (§9.4 steps 4–5),
//     both imported from embed-skills.ts
//
// It passes §9.4's sanity gate — see the bottom of this file — which is the
// only thing that makes it usable rather than decorative.
//
// MEASURED, and worth knowing before the real run: mean-centering is nearly a
// no-op HERE. Re-running this script with step 4 disabled moves the CS 484 /
// ENGH 302 overlap not at all (0 either way) and only reorders CS 484's #2 and
// #3. That is not evidence against §9.4 — it is because a tf-idf cosine is
// sparse, so most course × DWA cells are exactly 0 and every per-DWA mean is
// tiny. Hubness is a DENSE-vector pathology: text-embedding-3-small gives every
// pair a cosine around 0.3–0.6, and that is where "Prepare reports." starts
// ranking for all 689 courses. Do not read this file's clean overlap number as
// permission to skip step 4 in embed-skills.ts.

import type { Course, Skill } from "@/lib/types";

import {
  courseSegments,
  loadCourses,
  loadSkills,
  meanCenterPerSkill,
  printCoverage,
  rankTopK,
  sanityGate,
  selectTopK,
  writeCatalogSkills,
} from "./embed-skills";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

// Standard English stoplist plus the handful of catalog/registrar words that are
// frequent in BOTH corpora and mean nothing in either ("course", "student",
// "topic"). idf already flattens them; removing them outright keeps the short
// segments — a two-word course title is a whole segment — from being half noise.
const STOPWORDS = new Set(
  (
    "a about above after again against all also am an and any are as at be because been " +
    "before being below between both but by can cannot could did do does doing down during " +
    "each few for from further had has have having he her here hers herself him himself his " +
    "how i if in into is it its itself just me more most my myself no nor not now of off on " +
    "once only or other others our ours ourselves out over own same she should so some such " +
    "than that the their theirs them themselves then there these they this those through to " +
    "too under until up very was we were what when where which while who whom why will with " +
    "would you your yours yourself yourselves " +
    // catalog furniture
    "course courses class classes student students credit credits topic topics semester term " +
    "department offered include includes including introduction introduce introduces cover " +
    "covers covered emphasis emphasize emphasizes emphasized focus focuses focused provide " +
    "provides study studies studied various basic advanced special use used using upon well"
  ).split(" "),
);

// Porter (1980). Written out rather than pulled from npm: §6's stack table lists
// every dependency in the project and a stemmer is 100 lines. Both corpora go
// through the identical function, which is the only property that matters — a
// stemmer only has to be consistent, not linguistically correct.
function isConsonant(w: string, i: number): boolean {
  const c = w[i]!;
  if (c === "a" || c === "e" || c === "i" || c === "o" || c === "u") return false;
  if (c === "y") return i === 0 ? true : !isConsonant(w, i - 1);
  return true;
}

function measure(w: string): number {
  let n = 0;
  let i = 0;
  while (i < w.length && isConsonant(w, i)) i++;
  while (i < w.length) {
    while (i < w.length && !isConsonant(w, i)) i++;
    if (i >= w.length) break;
    n++;
    while (i < w.length && isConsonant(w, i)) i++;
  }
  return n;
}

function hasVowel(w: string): boolean {
  for (let i = 0; i < w.length; i++) if (!isConsonant(w, i)) return true;
  return false;
}

function endsDoubleConsonant(w: string): boolean {
  return w.length >= 2 && w[w.length - 1] === w[w.length - 2] && isConsonant(w, w.length - 1);
}

// cvc where the final consonant is not w, x or y — Porter's *o condition.
function endsCVC(w: string): boolean {
  if (w.length < 3) return false;
  const last = w[w.length - 1]!;
  return (
    isConsonant(w, w.length - 3) &&
    !isConsonant(w, w.length - 2) &&
    isConsonant(w, w.length - 1) &&
    last !== "w" &&
    last !== "x" &&
    last !== "y"
  );
}

// Ordered longest-first within each conflicting family, so a shorter suffix can
// never shadow a longer one that also matches ("ization" before "ation").
const STEP2: [string, string][] = [
  ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
  ["izer", "ize"], ["abli", "able"], ["alli", "al"], ["entli", "ent"],
  ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
  ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
  ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
];

const STEP3: [string, string][] = [
  ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
  ["ical", "ic"], ["ful", ""], ["ness", ""],
];

const STEP4 = [
  "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment",
  "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
];

function stem(input: string): string {
  let w = input;
  if (w.length <= 2) return w;

  // Step 1a
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (!w.endsWith("ss") && w.endsWith("s")) w = w.slice(0, -1);

  // Step 1b
  let applied = false;
  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    applied = true;
  } else if (w.endsWith("ing") && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    applied = true;
  }
  if (applied) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCVC(w)) w += "e";
  }

  // Step 1c
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";

  // Step 2
  for (const [suffix, replacement] of STEP2) {
    if (w.endsWith(suffix)) {
      if (measure(w.slice(0, -suffix.length)) > 0) w = w.slice(0, -suffix.length) + replacement;
      break;
    }
  }

  // Step 3
  for (const [suffix, replacement] of STEP3) {
    if (w.endsWith(suffix)) {
      if (measure(w.slice(0, -suffix.length)) > 0) w = w.slice(0, -suffix.length) + replacement;
      break;
    }
  }

  // Step 4
  for (const suffix of STEP4) {
    if (!w.endsWith(suffix)) continue;
    const base = w.slice(0, -suffix.length);
    if (measure(base) > 1 && (suffix !== "ion" || /[st]$/.test(base))) w = base;
    break;
  }

  // Step 5
  if (w.endsWith("e")) {
    const base = w.slice(0, -1);
    const m = measure(base);
    if (m > 1 || (m === 1 && !endsCVC(base))) w = base;
  }
  if (measure(w) > 1 && endsDoubleConsonant(w) && w.endsWith("l")) w = w.slice(0, -1);

  return w;
}

// Two morphological families Porter provably splits, both load-bearing in a
// STEM catalog matched against work activities:
//   - Greek -sis singulars ("analysis" → analysi) vs their -ses plurals
//     ("analyses" → analys). One rule collapses the whole family: emphasis,
//     hypothesis, synthesis, thesis, diagnosis, basis.
//   - "analysis / analytical / analyze" lands in three different stems
//     (analys / analyt / analyz). In a catalog whose gate course is Data Mining
//     and whose DWAs are full of "Analyze data…", that split is fatal.
function collapseFamilies(s: string): string {
  if (s.length > 3 && s.endsWith("si")) s = s.slice(0, -1); // analysi → analys
  if (s === "analys" || s === "analyt") return "analyz";
  return s;
}

function stems(text: string): string[] {
  const out: string[] = [];
  const cleaned = text
    .replace(/ /g, " ") // U+00A0 first, always (§9.1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  for (const word of cleaned.split(" ")) {
    // <3 chars is almost all noise here and the digits are course numbers.
    if (word.length < 3 || /^\d+$/.test(word)) continue;
    if (STOPWORDS.has(word)) continue;
    const s = collapseFamilies(stem(word));
    if (s.length < 3 || STOPWORDS.has(s)) continue;
    out.push(s);
  }
  return out;
}

/**
 * Unigrams plus adjacent-stem bigrams, both sides of the comparison.
 *
 * Bigrams are what stop a bag of words from reading *"…performance evaluation"*
 * as *"Evaluate skills of athletes or performers."* — those two share three
 * unigrams (evalu, perform, skill) and not a single adjacent pair, whereas a
 * true match shares `data_analyz` outright. Bigrams are rarer than unigrams, so
 * idf already gives them the larger weight they deserve; no tuning constant.
 * Adding them moved CS 484's top hit from "Evaluate skills of athletes or
 * performers." to "Determine appropriate methods for data analysis."
 *
 * Bigrams are formed AFTER stopword removal, so "methods for data analysis"
 * yields method_data and data_analyz. That is deliberate: the stopwords are
 * exactly the words whose position we do not want to depend on.
 */
function tokenize(text: string): string[] {
  const uni = stems(text);
  const out = uni.slice();
  for (let i = 1; i < uni.length; i++) out.push(uni[i - 1]! + "_" + uni[i]!);
  return out;
}

// ---------------------------------------------------------------------------
// TF-IDF
// ---------------------------------------------------------------------------

type SparseVec = { idx: Int32Array; val: Float64Array };

// A cosine between two SHORT bags of words is dominated by whichever single term
// they happen to share, and one shared term is usually polysemy rather than
// meaning: with this set to 1, "Data Mining" matched *"Operate mining
// equipment."* at 0.94 and "Advanced Composition" matched *"Study details of
// musical compositions."* Requiring two independent stems in common is the
// standard coordination fix, and it is what an embedding gets for free by
// reading the words in context. The real pipeline (embed-skills.ts) does not
// need this — which is one more reason it supersedes this file.
//
// Tuned, not guessed. Measured over all 689 courses:
//   1 → every course matches something, and the something is "Operate mining
//       equipment." for Data Mining. Useless.
//   2 → 141 courses with no chips, mean 3.1 chips, CS 484's top three are all
//       genuine data-analysis activities.        ← what ships
//   3 → 346 with no chips; MATH and PHYS drop to under one chip per course.
// A stricter variant requiring a shared BIGRAM (phrase evidence, not just two
// loose stems) was also measured: 437 empty, and it deleted correct matches —
// "Configure computer networks." off CS 455 — because the course says
// "computer communications and networking" and never the adjacent pair. Loose
// coordination beats phrase matching on a corpus this small.
const MIN_SHARED_TERMS = 2;

/**
 * Vocabulary and document frequency are built over the UNION of both corpora
 * (2,070 DWA titles + 689 courses). They have to share one idf or the cosine is
 * between vectors in two different spaces — and the union is also what makes
 * "data" and "system" correctly cheap: they are common on both sides.
 */
class Vocab {
  readonly id = new Map<string, number>();
  readonly df: number[] = [];
  private docs = 0;
  private idf: Float64Array | null = null;

  addDocument(tokens: string[]): void {
    this.docs++;
    for (const t of new Set(tokens)) {
      let i = this.id.get(t);
      if (i === undefined) {
        i = this.df.length;
        this.id.set(t, i);
        this.df.push(0);
      }
      this.df[i]!++;
    }
  }

  freeze(): void {
    this.idf = new Float64Array(this.df.length);
    for (let i = 0; i < this.df.length; i++) {
      // Smoothed idf; +1 so a term present in every document still contributes
      // its (small) share rather than dropping to exactly zero.
      this.idf[i] = Math.log(this.docs / (1 + this.df[i]!)) + 1;
    }
  }

  /** tf-idf with sublinear tf, L2-normalized so cosine is a dot product. */
  vector(tokens: string[]): SparseVec {
    if (!this.idf) throw new Error("Vocab.freeze() must run before Vocab.vector()");
    const counts = new Map<number, number>();
    for (const t of tokens) {
      const i = this.id.get(t);
      if (i === undefined) continue; // never seen in either corpus → no signal
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    const idx = new Int32Array(counts.size);
    const val = new Float64Array(counts.size);
    let k = 0;
    let norm = 0;
    for (const [i, count] of counts) {
      const w = (1 + Math.log(count)) * this.idf[i]!;
      idx[k] = i;
      val[k] = w;
      norm += w * w;
      k++;
    }
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < val.length; j++) val[j] = val[j]! / norm;
    return { idx, val };
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const courses: Course[] = loadCourses();
  const skills: Skill[] = loadSkills();
  console.log(
    `map-skills-lexical (PROVISIONAL — see header): ${courses.length} courses × ${skills.length} DWAs`,
  );

  // §9.4 step 2's segments (title + one per sentence), PLUS one whole-course
  // segment. The extra segment is lexical-only and does not exist in
  // embed-skills.ts, for a reason specific to bag-of-words: a DWA whose evidence
  // is split across two sentences ("…data quality…" in one, "…evaluation…" in
  // the next) scores zero on every individual sentence. An embedding of either
  // sentence still lands near that DWA; a term vector does not. Because max()
  // takes the best segment and the whole-course vector is longer — therefore
  // lower-scoring after L2 normalization — it only ever wins where no single
  // sentence found anything, so it buys coverage without re-introducing the
  // length bias §9.4 step 2 exists to remove.
  const segmentsByCourse = courses.map((c) => {
    const segs = courseSegments(c);
    return segs.length > 1 ? [...segs, segs.join(" ")] : segs;
  });
  const segmentTokens = segmentsByCourse.map((segs) => segs.map(tokenize));
  const skillTokens = skills.map((s) => tokenize(s.skillName));

  const vocab = new Vocab();
  for (const toks of skillTokens) vocab.addDocument(toks);
  for (const perCourse of segmentTokens) vocab.addDocument(perCourse.flat());
  vocab.freeze();
  console.log(`  vocabulary : ${vocab.id.size} stems`);

  // Inverted index over the DWA side: term → (dwa, weight). Only DWAs sharing a
  // term with the segment can score above zero, so this turns a 4k × 2k dense
  // product into a few million adds.
  const postings = new Map<number, { d: number; w: number }[]>();
  for (let d = 0; d < skills.length; d++) {
    const v = vocab.vector(skillTokens[d]!);
    for (let j = 0; j < v.idx.length; j++) {
      const term = v.idx[j]!;
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push({ d, w: v.val[j]! });
    }
  }

  // §9.4 step 3, with step 2's max-over-segments.
  console.log("  scoring …");
  const raw = new Float64Array(courses.length * skills.length);
  const acc = new Float64Array(skills.length);
  const shared = new Int32Array(skills.length);
  for (let c = 0; c < courses.length; c++) {
    const row = raw.subarray(c * skills.length, (c + 1) * skills.length);
    for (const tokens of segmentTokens[c]!) {
      if (tokens.length === 0) continue;
      acc.fill(0);
      shared.fill(0);
      const v = vocab.vector(tokens);
      for (let j = 0; j < v.idx.length; j++) {
        const list = postings.get(v.idx[j]!);
        if (!list) continue;
        const weight = v.val[j]!;
        for (const p of list) {
          acc[p.d]! += weight * p.w;
          shared[p.d]!++;
        }
      }
      for (let s = 0; s < skills.length; s++) {
        if (shared[s]! < MIN_SHARED_TERMS) continue;
        if (acc[s]! > row[s]!) row[s] = acc[s]!;
      }
    }
  }

  // §9.4 steps 4–6 — imported, identical to what embed-skills.ts will run,
  // except for LEXICAL_SCORE_FLOOR, which exists only because TF-IDF has a junk
  // tail that embeddings do not. Measured on this corpus: real matches score
  // 0.25–1.00, stem collisions and cross-domain false friends score 0.03–0.19.
  // Without the floor a CS senior's schedule card offers "Peer Tutoring in
  // Writing across the Disciplines" as a skill-closing elective, which §0 rule 7
  // makes indefensible in front of registrars. embed-skills.ts passes no floor.
  const LEXICAL_SCORE_FLOOR = 0.2;
  const centered = meanCenterPerSkill(raw, courses.length, skills.length);
  const catalogSkills = selectTopK(centered, courses, skills, LEXICAL_SCORE_FLOOR);
  writeCatalogSkills(catalogSkills);
  printCoverage(catalogSkills, skills);
  sanityGate(catalogSkills, skills, rankTopK(centered, courses, skills));

  console.log("\n  sanity gate PASSED");
  console.log(
    "  REMINDER: this file is a lexical stand-in. Re-run scripts/embed-skills.ts\n" +
      "  and re-commit data/catalog-skills.json as soon as OPENAI_API_KEY exists.",
  );
}

try {
  main();
} catch (err) {
  console.error(
    "\nmap-skills-lexical failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
