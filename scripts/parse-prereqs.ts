// scripts/parse-prereqs.ts — CLAUDE.md §9.2, deterministic path
//
//   prereqText (Banner boolean grammar) → data/prereqs.json (PrereqGraph)
//
// Run:  npx tsx scripts/parse-prereqs.ts        (cwd = repo root)
//
// ============================================================================
// WHY THIS SCRIPT EXISTS ALONGSIDE build-prereqs.ts
// ============================================================================
// §9.2 specifies an OpenAI pass (scripts/build-prereqs.ts). That script is
// written and correct, but it cannot run without OPENAI_API_KEY, and
// data/prereqs.json is a COMMITTED artifact (§7) that every downstream module
// reads. So the committed graph is produced HERE, deterministically, with no
// network and no key.
//
// This is not a fallback hack. §9.2's own words are that GMU "does not write
// prose" — it emits a Banner-generated boolean expression. A boolean expression
// with a fixed token vocabulary is a *grammar*, and a grammar is better served
// by a parser than by a language model: the parser is exact, reproducible,
// free, and its failures are visible instead of plausible. The model pass earns
// its keep on institutions that DO write prose; at GMU it is the cross-check.
//
// ****************************************************************************
// PROVENANCE / PROVISIONAL MARKER
//   data/prereqs.json as committed today was produced by THIS script, not by
//   the model. JSON carries no comments and PrereqGraph is a bare
//   Record<string, PrereqRule> (§8) — adding a "_meta" key would surface as a
//   phantom course to anything that does Object.keys(graph) — so the provenance
//   note lives here and in the run banner rather than in the data file.
//   To regenerate with the model instead:  npx tsx scripts/build-prereqs.ts
//   To diff the two:                       npx tsx scripts/build-prereqs.ts --compare
// ****************************************************************************
//
// ============================================================================
// THE GRAMMAR, as actually observed in data/courses.json (274 prereq blocks,
// 689 courses, subjects CS ENGH IT MATH PHYS STAT). Every rule below was
// derived by stripping known tokens from all 274 strings and confirming the
// residue was EMPTY — i.e. this grammar has 100% token coverage of the corpus.
// ============================================================================
//
//   block   := "Required Prerequisite" ["s"] ":" expr "." [footnote]
//   expr    := orExpr
//   orExpr  := andExpr (("or" | ",") andExpr)*      ← §9.2: a comma-separated
//                                                     list inside a group is an
//                                                     "or" list, not an "and"
//   andExpr := atom ("and" atom)*
//   atom    := "(" expr ")" | course | junk
//   course  := [SUBJ] NNN ["T"] ("^*" | "^XS" | "^XP" | "^" GRADE)*
//            | ("L" | "U") NNN
//   junk    := "minimum score of N in '...'" | "SUBJ N---"
//
// Token semantics, each verified against the live corpus:
//
//   ^XS / ^XP  transfer / test-credit equivalency. NOT a grade, NOT a course.
//              §9.2: "CS 211^C or 211^XS" is ONE course with two credit paths.
//              Failing to dedupe doubles every oneOf group with phantom nodes.
//   NNNT       same idea in a different notation ("MATH 104^C, 104T" → MATH 104).
//   LNNN/UNNN  same idea again, letter-prefixed ("IT 341^C, L341, 341^XS or 341"
//              is FOUR spellings of one course). 14 blocks use these.
//   ^*         "May be taken concurrently" — the footnote is emitted once at the
//              end of the block. 35 blocks. This is the ONLY corequisite signal
//              in the whole catalog; the literal word "corequisite" appears zero
//              times. Feeds PrereqRule.coreq — see COREQ POLICY below.
//   ^A ^B ^B- ^C ^C- ^D   the real grade codes. Folded to one rule-level
//              minGrade (§8), which §9.2 verified lossless across CS.
//   bare NNN   resolve against the NEAREST PRECEDING SUBJECT, which is how
//              Banner elides repetition. §9.2 counts nine unanchored tokens.
//
// ============================================================================
// THREE DESIGN DECISIONS THAT ARE NOT OBVIOUS
// ============================================================================
//
// 1. DEDUPE HAPPENS ON THE TOKEN STREAM, BEFORE PARSING — and that is what
//    makes operator precedence come out right. Five blocks omit the outer
//    parens entirely, e.g. PHYS 246:
//        "PHYS 244^C or 244^XS and PHYS 245^*^C or 245^XS"
//    Standard precedence (and binds tighter than or) parses that as
//        244 ∨ (244XS ∧ 245) ∨ 245XS      ← nonsense
//    Collapsing adjacent same-code alternatives FIRST rewrites the stream to
//        244 and 245                       ← exactly what the catalog means
//    Dedupe is therefore load-bearing for correctness, not just for tidiness.
//
// 2. THE AST IS CONVERTED TO CNF, NOT FLATTENED. PrereqRule's {allOf, oneOf}
//    IS conjunctive normal form: allOf is the unit clauses, oneOf is the
//    disjunctive ones. So distributing ∨ over ∧ loses NOTHING. CS 484's
//    "(STAT ...) or (MATH 351 and 352)" becomes two oneOf groups rather than
//    one flattened group that would falsely claim MATH 351 alone suffices.
//    A cartesian-product guard (MAX_CLAUSES) falls back to a flat union if any
//    block would ever blow up; on today's corpus it never fires.
//
// 3. COREQ POLICY: only an UNAMBIGUOUS concurrent course becomes a coreq.
//    §11.3 step 1 excludes a course "whose coreq list contains anything not
//    already in coursesTaken and not itself eligible next term", and step 5
//    force-adds the coreq's section to the combo. Both treat coreq as a hard
//    "you must also register for exactly this". That is only true when the
//    clause has ONE option (PHYS 246 → PHYS 245, the lab). When a concurrent
//    course sits inside a multi-option group (IT 102 offers five ways in, two
//    of them concurrent), writing all five into coreq would tell §11.3 to
//    register the student for all five. So those stay as ordinary prereq
//    alternatives — conservative, occasionally under-recommends, never
//    over-registers. Count reported at the end of the run.
//
// Every emitted code is validated against courses.json (§9.2). Out-of-catalog
// references are DROPPED, not emitted: the catalog covers six subjects, and
// blocks legitimately reference ECE / INFS / HNRS / ARAB / ... which we never
// scraped. Emitting them would make §9.5's dangling-prereq gate fail forever
// and there would be nothing to fix. They are counted and printed instead.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Course, PrereqGraph, PrereqRule } from "@/lib/types";

// Resolved from this file, not process.cwd(), so the script cannot quietly
// write data/ into whatever directory it happened to be invoked from.
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const COURSES_PATH = DATA_DIR + "courses.json";
const OUT_PATH = DATA_DIR + "prereqs.json";

// Cartesian-product guard for CNF distribution (design note 2). 64 is far above
// anything the corpus produces (observed max: 2) and far below anything that
// would stall the script or produce an unreadable rule.
const MAX_CLAUSES = 64;

// ^XS and ^XP are equivalencies, not grades — the single most important
// distinction in this file (§9.2).
const EQUIVALENCY_CODES = new Set(["XS", "XP"]);

// Strictest first. Used only to break ties when one block mixes grade codes;
// §9.2 verified CS never mixes, but ENGH/IT/MATH do, so a rule is needed.
const GRADE_RANK: Record<string, number> = {
  A: 8,
  "B+": 7,
  B: 6,
  "B-": 5,
  "C+": 4,
  C: 3,
  "C-": 2,
  D: 1,
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface CourseTok {
  k: "course";
  code: string; // canonical "DEPT NNN"
  concurrent: boolean; // carried a ^* marker on any credit path
  grades: string[]; // real letter grades only; XS/XP excluded
}
type Tok =
  | { k: "(" }
  | { k: ")" }
  | { k: "and" }
  | { k: "or" }
  | { k: "junk" }
  | CourseTok;

// Sticky (/y) so the scanner advances deterministically and any character it
// cannot explain is reported rather than silently skipped. A silent skip is how
// a prereq parser "works fine" and quietly drops half a boolean expression.
const RE = {
  ws: /\s+/y,
  lparen: /\(/y,
  rparen: /\)/y,
  and: /and\b/iy,
  or: /or\b/iy,
  comma: /,/y,
  junk: /@junk@/y,
  period: /\./y,
  // "CS 211^C", "MATH 103T^C", "HNRT 225^C", "PHYS 245^*^C"
  subjCourse: /([A-Z]{2,5})[ \t]+(\d{3})(T?)((?:\^\*|\^(?:XS|XP|[A-D][+-]?))*)/y,
  // "L341", "U113" — one letter, no space. Must be tried BEFORE bareCourse or
  // the scanner would sit on the letter, fail, and drop it as an unknown char.
  equivPrefix: /([LU])(\d{3})/y,
  // "211^XS", "104T", "203"
  bareCourse: /(\d{3})(T?)((?:\^\*|\^(?:XS|XP|[A-D][+-]?))*)/y,
};

function parseFlags(raw: string): { concurrent: boolean; grades: string[] } {
  let concurrent = false;
  const grades: string[] = [];
  for (const part of raw.split("^")) {
    if (!part) continue;
    if (part === "*") concurrent = true;
    else if (EQUIVALENCY_CODES.has(part)) continue; // credit path, not a grade
    else grades.push(part);
  }
  return { concurrent, grades };
}

interface TokenizeResult {
  toks: Tok[];
  unknown: string[]; // characters the grammar could not explain
  usedFallbackSubject: boolean; // a bare number appeared before any subject
}

// `ownerSubject` seeds the "nearest preceding subject" state. Banner elides the
// subject only when it repeats, so a leading bare number can only mean the
// course's own subject.
function tokenize(text: string, ownerSubject: string): TokenizeResult {
  const toks: Tok[] = [];
  const unknown: string[] = [];
  let subject = ownerSubject;
  let usedFallbackSubject = false;
  let sawSubject = false;

  let i = 0;
  const at = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i;
    return re.exec(text);
  };

  while (i < text.length) {
    let m: RegExpExecArray | null;

    if ((m = at(RE.ws))) {
      i = RE.ws.lastIndex;
      continue;
    }
    if (at(RE.lparen)) {
      toks.push({ k: "(" });
      i = RE.lparen.lastIndex;
      continue;
    }
    if (at(RE.rparen)) {
      toks.push({ k: ")" });
      i = RE.rparen.lastIndex;
      continue;
    }
    if (at(RE.and)) {
      toks.push({ k: "and" });
      i = RE.and.lastIndex;
      continue;
    }
    if (at(RE.or)) {
      toks.push({ k: "or" });
      i = RE.or.lastIndex;
      continue;
    }
    // §9.2: a comma-separated list inside a group is a list of ALTERNATIVES.
    if (at(RE.comma)) {
      toks.push({ k: "or" });
      i = RE.comma.lastIndex;
      continue;
    }
    if (at(RE.junk)) {
      toks.push({ k: "junk" });
      i = RE.junk.lastIndex;
      continue;
    }
    if (at(RE.period)) {
      i = RE.period.lastIndex;
      continue;
    }
    if ((m = at(RE.subjCourse))) {
      subject = m[1];
      sawSubject = true;
      const { concurrent, grades } = parseFlags(m[4] ?? "");
      toks.push({ k: "course", code: `${subject} ${m[2]}`, concurrent, grades });
      i = RE.subjCourse.lastIndex;
      continue;
    }
    if ((m = at(RE.equivPrefix))) {
      if (!sawSubject) usedFallbackSubject = true;
      // L341 / U113 carry no grade and no concurrency — they ARE a credit path.
      toks.push({
        k: "course",
        code: `${subject} ${m[2]}`,
        concurrent: false,
        grades: [],
      });
      i = RE.equivPrefix.lastIndex;
      continue;
    }
    if ((m = at(RE.bareCourse))) {
      if (!sawSubject) usedFallbackSubject = true;
      const { concurrent, grades } = parseFlags(m[3] ?? "");
      toks.push({ k: "course", code: `${subject} ${m[1]}`, concurrent, grades });
      i = RE.bareCourse.lastIndex;
      continue;
    }

    unknown.push(text[i]!);
    i += 1;
  }

  return { toks, unknown, usedFallbackSubject };
}

// §9.1's normalizer rule, re-applied here defensively: GMU puts U+00A0 between
// subject and number. courses.json is already clean, but this parser must not
// depend on an upstream script staying clean — /[A-Z]{2,4} \d{3}/ matches ZERO
// courses against nbsp and fails SILENTLY.
function preprocess(raw: string): string {
  return (
    raw
      .replace(/ /g, " ")
      .replace(/^\s*Required Prerequisites?:\s*/i, "")
      // The footnote that defines ^*. Stripped after the inline markers are
      // already in the text, so the markers survive and the prose does not.
      .replace(/\^\*\s*May be taken concurrently\.?/gi, " ")
      // §9.2: "minimum score of 80 in 'Math Placement Aleks'" is NOT a course.
      // Replaced with a sentinel rather than deleted so it still occupies an
      // alternative slot in the token stream and cannot glue two courses
      // together across the hole it would otherwise leave.
      .replace(/minimum score of\s+\d+\s+in\s+'[^']*'/gi, " @junk@ ")
      // "ENGH 2---" — a Banner wildcard for "any 200-level ENGH". Not a course.
      .replace(/\b(?:[A-Z]{2,5}\s+)?\d-{2,}/g, " @junk@ ")
  );
}

// Design note 1: collapse "X or X" where both spellings normalize to the same
// course. Runs on the flat token stream, before parsing, so it also repairs
// precedence in the five unparenthesised blocks.
function mergeAdjacentDuplicates(toks: Tok[]): { toks: Tok[]; merged: number } {
  const out: Tok[] = [];
  let merged = 0;
  for (const t of toks) {
    if (t.k === "course" && out.length >= 2) {
      const op = out[out.length - 1]!;
      const prev = out[out.length - 2]!;
      if (op.k === "or" && prev.k === "course" && prev.code === t.code) {
        out.pop(); // drop the now-meaningless "or"
        prev.concurrent = prev.concurrent || t.concurrent;
        prev.grades.push(...t.grades);
        merged += 1;
        continue;
      }
    }
    out.push(t);
  }
  return { toks: out, merged };
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------

type Node =
  | { t: "leaf"; code: string; concurrent: boolean; grades: string[] }
  | { t: "junk" }
  | { t: "and"; kids: Node[] }
  | { t: "or"; kids: Node[] };

function parse(toks: Tok[], problems: string[]): Node {
  let p = 0;
  const peek = (): Tok | undefined => toks[p];

  function parseOr(): Node {
    const kids = [parseAnd()];
    while (peek()?.k === "or") {
      p += 1;
      kids.push(parseAnd());
    }
    return kids.length === 1 ? kids[0]! : { t: "or", kids };
  }

  function parseAnd(): Node {
    const kids = [parseAtom()];
    while (peek()?.k === "and") {
      p += 1;
      kids.push(parseAtom());
    }
    return kids.length === 1 ? kids[0]! : { t: "and", kids };
  }

  function parseAtom(): Node {
    const t = peek();
    if (!t) {
      problems.push("unexpected end of expression");
      return { t: "junk" };
    }
    if (t.k === "(") {
      p += 1;
      const inner = parseOr();
      if (peek()?.k === ")") p += 1;
      else problems.push("unbalanced '(' — missing ')'");
      return inner;
    }
    if (t.k === "course") {
      p += 1;
      return {
        t: "leaf",
        code: t.code,
        concurrent: t.concurrent,
        grades: t.grades,
      };
    }
    if (t.k === "junk") {
      p += 1;
      return { t: "junk" };
    }
    // A stray ")" or a dangling operator. Consume it so the loop terminates.
    p += 1;
    problems.push(`unexpected token '${t.k}'`);
    return { t: "junk" };
  }

  const root = parseOr();
  if (p < toks.length) problems.push(`${toks.length - p} trailing token(s)`);
  return root;
}

// ---------------------------------------------------------------------------
// AST → CNF
// ---------------------------------------------------------------------------

interface Lit {
  code: string;
  concurrent: boolean;
  grades: string[];
}
type Clause = Lit[]; // a disjunction

function dedupeLits(lits: Lit[]): Clause {
  const byCode = new Map<string, Lit>();
  for (const l of lits) {
    const seen = byCode.get(l.code);
    if (seen) {
      seen.concurrent = seen.concurrent || l.concurrent;
      seen.grades.push(...l.grades);
    } else {
      byCode.set(l.code, {
        code: l.code,
        concurrent: l.concurrent,
        grades: [...l.grades],
      });
    }
  }
  return [...byCode.values()];
}

// An empty clause LIST means "no constraint" (logically TRUE), which is exactly
// what a junk token contributes.
//
// The one deliberate departure from strict logic: a TRUE branch inside an "or"
// would make the whole disjunction TRUE and erase the block. §9.2 says to
// discard non-course tokens, not to discard the courses standing next to them —
// otherwise CS 112, whose alternatives are "placement score OR one of six MATH
// courses", would emit no prereqs at all and the MATH→CS chain the demo is
// built on would vanish. So TRUE branches are dropped from an "or" instead of
// collapsing it. Strictly over-constrained, deliberately, and only ever in the
// direction of showing the student MORE of the prereq chain.
function toCnf(n: Node, onFallback: (size: number) => void): Clause[] {
  switch (n.t) {
    case "junk":
      return [];
    case "leaf":
      return [[{ code: n.code, concurrent: n.concurrent, grades: [...n.grades] }]];
    case "and":
      return n.kids.flatMap((k) => toCnf(k, onFallback));
    case "or": {
      const parts = n.kids
        .map((k) => toCnf(k, onFallback))
        .filter((p) => p.length > 0);
      if (parts.length === 0) return [];

      let size = 1;
      for (const part of parts) size *= part.length;
      if (size > MAX_CLAUSES) {
        // Never fires on today's corpus (observed max 2). Kept so a future
        // catalog revision degrades to a permissive flat group instead of
        // hanging the script.
        onFallback(size);
        return [dedupeLits(parts.flat().flat())];
      }

      let acc: Clause[] = [[]];
      for (const part of parts) {
        const next: Clause[] = [];
        for (const a of acc) for (const c of part) next.push([...a, ...c]);
        acc = next;
      }
      return acc.map(dedupeLits);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule assembly
// ---------------------------------------------------------------------------

function pickMinGrade(grades: string[]): string | null {
  if (grades.length === 0) return null;
  const counts = new Map<string, number>();
  for (const g of grades) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best: string | null = null;
  for (const [g, n] of counts) {
    if (best === null) {
      best = g;
      continue;
    }
    const bn = counts.get(best)!;
    // Most frequent wins; ties break toward the STRICTER grade so the UI never
    // understates what the catalog asks for.
    if (n > bn || (n === bn && (GRADE_RANK[g] ?? 0) > (GRADE_RANK[best] ?? 0))) {
      best = g;
    }
  }
  return best;
}

interface BuildStats {
  droppedCodes: Map<string, number>; // out-of-catalog code → times referenced
  droppedClauses: number; // clauses emptied by catalog validation
  concurrentInGroup: number; // coreqs demoted to plain alternatives (note 3)
  mixedGradeBlocks: string[];
  cnfFallbacks: string[];
  parseProblems: string[];
  unknownChars: Map<string, number>;
  fallbackSubject: string[];
  mergedTokens: number;
}

function buildRule(
  course: Course,
  catalog: Set<string>,
  stats: BuildStats,
): PrereqRule | null {
  const text = preprocess(course.prereqText);
  const ownerSubject = course.code.split(" ")[0] ?? "";

  const { toks, unknown, usedFallbackSubject } = tokenize(text, ownerSubject);
  for (const ch of unknown) {
    stats.unknownChars.set(ch, (stats.unknownChars.get(ch) ?? 0) + 1);
  }
  if (usedFallbackSubject) stats.fallbackSubject.push(course.code);

  const merged = mergeAdjacentDuplicates(toks);
  stats.mergedTokens += merged.merged;

  const problems: string[] = [];
  const ast = parse(merged.toks, problems);
  for (const pr of problems) stats.parseProblems.push(`${course.code}: ${pr}`);

  let clauses = toCnf(ast, (size) =>
    stats.cnfFallbacks.push(`${course.code} (would have been ${size} clauses)`),
  );

  // §9.2: validate every emitted course code against courses.json.
  clauses = clauses
    .map((clause) => {
      const kept: Clause = [];
      for (const lit of clause) {
        if (catalog.has(lit.code)) kept.push(lit);
        else
          stats.droppedCodes.set(
            lit.code,
            (stats.droppedCodes.get(lit.code) ?? 0) + 1,
          );
      }
      if (kept.length === 0 && clause.length > 0) stats.droppedClauses += 1;
      return kept;
    })
    .filter((c) => c.length > 0);

  // Subsumption: if clause A ⊆ clause B then B is implied by A and is noise.
  // Chiefly this deletes "(CS 310 or CS 310-something)" groups once a unit
  // clause already requires CS 310.
  const bySize = clauses
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => a.c.length - b.c.length || a.idx - b.idx);
  const kept: Clause[] = [];
  const keptSets: Set<string>[] = [];
  for (const { c } of bySize) {
    const set = new Set(c.map((l) => l.code));
    const key = [...set].sort().join("|");
    if (keptSets.some((k) => [...k].sort().join("|") === key)) continue; // exact dup
    if (keptSets.some((k) => [...k].every((code) => set.has(code)))) continue; // superset
    kept.push(c);
    keptSets.push(set);
  }

  const allOf: string[] = [];
  const coreq: string[] = [];
  const oneOf: string[][] = [];
  const grades: string[] = [];

  for (const clause of kept) {
    for (const lit of clause) grades.push(...lit.grades);
    if (clause.length === 1) {
      const only = clause[0]!;
      // Design note 3: a lone concurrent course is an unambiguous corequisite.
      if (only.concurrent) coreq.push(only.code);
      else allOf.push(only.code);
    } else {
      if (clause.some((l) => l.concurrent)) stats.concurrentInGroup += 1;
      oneOf.push(clause.map((l) => l.code));
    }
  }

  // A course cannot be both hard-required and merely concurrent. allOf wins.
  const allOfSet = new Set(allOf);
  const coreqFinal = [...new Set(coreq)].filter((c) => !allOfSet.has(c));

  const distinctGrades = new Set(grades);
  if (distinctGrades.size > 1) {
    stats.mixedGradeBlocks.push(
      `${course.code}: ${[...distinctGrades].join("/")}`,
    );
  }

  if (allOfSet.size === 0 && oneOf.length === 0 && coreqFinal.length === 0) {
    // Everything this block referenced lives outside the six scraped subjects,
    // or the whole block was a placement score. Emitting {allOf:[],oneOf:[]}
    // would read downstream as "this course has no prerequisites", which is a
    // stronger and falser claim than simply having no entry.
    return null;
  }

  return {
    allOf: [...allOfSet],
    oneOf,
    minGrade: pickMinGrade(grades),
    coreq: coreqFinal,
  };
}

// ---------------------------------------------------------------------------
// §9.2's two ground-truth strings, wired in as an executable self-check.
// If the parser ever regresses on these it must fail loudly, not write a
// plausible-looking file — a wrong prereq graph makes the demo assert false
// things about a real university's catalog (§9.5).
// ---------------------------------------------------------------------------
function selfCheck(graph: PrereqGraph): boolean {
  const problems: string[] = [];

  const eq = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

  // CS 330: "((CS 211^C or 211^XS) and (MATH 125^C or 125^XS))."
  //         Two courses, two credit paths each → a plain two-item allOf.
  const cs330 = graph["CS 330"];
  if (!cs330) problems.push("CS 330 missing from graph");
  else {
    if (!eq(cs330.allOf, ["CS 211", "MATH 125"]))
      problems.push(`CS 330 allOf = ${JSON.stringify(cs330.allOf)}`);
    if (cs330.oneOf.length !== 0)
      problems.push(`CS 330 oneOf should be empty, got ${JSON.stringify(cs330.oneOf)}`);
    if (cs330.minGrade !== "C") problems.push(`CS 330 minGrade = ${cs330.minGrade}`);
    if (cs330.coreq.length !== 0) problems.push("CS 330 coreq should be empty");
  }

  // CS 484: "(CS 310^C or 310^XS) and ((STAT 344^C, 344^XS, 334^C, 334^XS or
  //          346^C) or (MATH 351^C and 352^C))."
  //         CNF: CS310 ∧ (S344∨S334∨S346∨M351) ∧ (S344∨S334∨S346∨M352).
  const cs484 = graph["CS 484"];
  if (!cs484) problems.push("CS 484 missing from graph");
  else {
    if (!eq(cs484.allOf, ["CS 310"]))
      problems.push(`CS 484 allOf = ${JSON.stringify(cs484.allOf)}`);
    if (cs484.oneOf.length !== 2)
      problems.push(`CS 484 should have 2 oneOf groups, got ${cs484.oneOf.length}`);
    const want = [
      ["STAT 344", "STAT 334", "STAT 346", "MATH 351"],
      ["STAT 344", "STAT 334", "STAT 346", "MATH 352"],
    ];
    for (const w of want) {
      if (!cs484.oneOf.some((g) => eq(g, w)))
        problems.push(`CS 484 missing oneOf group ${JSON.stringify(w)}`);
    }
    if (cs484.minGrade !== "C") problems.push(`CS 484 minGrade = ${cs484.minGrade}`);
  }

  if (problems.length === 0) {
    console.log("SELF-CHECK  PASS — CS 330 and CS 484 match §9.2 ground truth");
    return true;
  }
  console.error("SELF-CHECK  FAIL");
  for (const p of problems) console.error("  - " + p);
  return false;
}

// ---------------------------------------------------------------------------

function main(): void {
  console.log("parse-prereqs — CLAUDE.md §9.2 (deterministic, no OpenAI call)\n");

  const courses = JSON.parse(readFileSync(COURSES_PATH, "utf8")) as Course[];
  const catalog = new Set(courses.map((c) => c.code));
  const withText = courses.filter((c) => c.prereqText && c.prereqText.trim());

  console.log(`catalog          ${courses.length} courses`);
  console.log(`prereq blocks    ${withText.length}\n`);

  const stats: BuildStats = {
    droppedCodes: new Map(),
    droppedClauses: 0,
    concurrentInGroup: 0,
    mixedGradeBlocks: [],
    cnfFallbacks: [],
    parseProblems: [],
    unknownChars: new Map(),
    fallbackSubject: [],
    mergedTokens: 0,
  };

  const graph: PrereqGraph = {};
  let emptied = 0;
  for (const course of withText) {
    const rule = buildRule(course, catalog, stats);
    if (rule) graph[course.code] = rule;
    else emptied += 1;
  }

  // Stable key order so re-runs produce byte-identical files and a diff means
  // the parser or the catalog actually changed.
  const ordered: PrereqGraph = {};
  for (const code of Object.keys(graph).sort()) ordered[code] = graph[code]!;

  writeFileSync(OUT_PATH, JSON.stringify(ordered, null, 2) + "\n", "utf8");

  // ---- report -------------------------------------------------------------
  const rules = Object.values(ordered);
  const refs = rules.flatMap((r) => [...r.allOf, ...r.oneOf.flat(), ...r.coreq]);
  const droppedTotal = [...stats.droppedCodes.values()].reduce((a, b) => a + b, 0);

  console.log("---- emitted -------------------------------------------------");
  console.log(`rules written              ${rules.length}`);
  console.log(`blocks with no usable rule ${emptied}  (all refs outside the six scraped subjects, or placement-score-only)`);
  console.log(`allOf entries              ${rules.reduce((n, r) => n + r.allOf.length, 0)}`);
  console.log(`oneOf groups               ${rules.reduce((n, r) => n + r.oneOf.length, 0)}`);
  console.log(`coreq entries              ${rules.reduce((n, r) => n + r.coreq.length, 0)}`);
  console.log(`minGrade set               ${rules.filter((r) => r.minGrade).length}`);

  console.log("\n---- reference resolution ------------------------------------");
  console.log(`resolved references        ${refs.length}  (all validated against courses.json)`);
  console.log(`dropped references         ${droppedTotal} across ${stats.droppedCodes.size} distinct out-of-catalog codes`);
  console.log(`clauses emptied by drops   ${stats.droppedClauses}`);
  const bySubject = new Map<string, number>();
  for (const [code, n] of stats.droppedCodes) {
    const s = code.split(" ")[0]!;
    bySubject.set(s, (bySubject.get(s) ?? 0) + n);
  }
  console.log(
    "  by subject: " +
      [...bySubject]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${s}=${n}`)
        .join(" "),
  );
  // A dropped ARAB/ECE/HNRS code is expected — we never scraped those subjects.
  // A dropped code in a subject we DID scrape is a different animal: it means
  // either the catalog page omits the course (GMU lists a few prereq-only
  // placement courses that have no catalog entry) or scrape-catalog.ts missed a
  // page. Called out separately so the two never get confused.
  const scrapedSubjects = new Set([...catalog].map((c) => c.split(" ")[0]!));
  const suspicious = [...stats.droppedCodes]
    .filter(([code]) => scrapedSubjects.has(code.split(" ")[0]!))
    .sort((a, b) => b[1] - a[1]);
  console.log(
    `  UNRESOLVED INSIDE A SCRAPED SUBJECT (${suspicious.length}): ` +
      (suspicious.map(([c, n]) => `${c}×${n}`).join("  ") || "none"),
  );

  console.log("\n---- grammar handling ----------------------------------------");
  console.log(`XS/XP/T/L/U duplicate tokens collapsed   ${stats.mergedTokens}`);
  console.log(`concurrent courses kept as alternatives  ${stats.concurrentInGroup}  (multi-option groups — see COREQ POLICY)`);
  console.log(`blocks mixing grade codes                ${stats.mixedGradeBlocks.length}`);
  if (stats.mixedGradeBlocks.length)
    console.log("  " + stats.mixedGradeBlocks.join("  "));
  console.log(`CNF distribution fallbacks               ${stats.cnfFallbacks.length}`);
  if (stats.cnfFallbacks.length) console.log("  " + stats.cnfFallbacks.join("  "));
  console.log(`parse problems                           ${stats.parseProblems.length}`);
  if (stats.parseProblems.length)
    console.log("  " + stats.parseProblems.slice(0, 10).join("\n  "));
  console.log(`unexplained characters                   ${[...stats.unknownChars.values()].reduce((a, b) => a + b, 0)}`);
  if (stats.unknownChars.size)
    console.log(
      "  " +
        [...stats.unknownChars]
          .map(([c, n]) => `${JSON.stringify(c)}×${n}`)
          .join(" "),
    );
  console.log(`bare number before any subject           ${stats.fallbackSubject.length}${stats.fallbackSubject.length ? " (" + stats.fallbackSubject.join(", ") + ")" : ""}`);

  console.log("\n---- §9.2 ground truth ---------------------------------------");
  for (const code of ["CS 330", "CS 484"]) {
    const src = withText.find((c) => c.code === code);
    console.log(`\n${code}`);
    console.log(`  in : ${src?.prereqText}`);
    console.log(`  out: ${JSON.stringify(ordered[code])}`);
  }
  console.log("");

  const ok = selfCheck(ordered);
  console.log(`\nwrote ${OUT_PATH}`);
  if (!ok) {
    console.error(
      "\nThe file was written so the diff is inspectable, but the parser does " +
        "NOT reproduce §9.2's verified strings. Do not commit this graph.",
    );
    process.exit(1);
  }
}

main();
