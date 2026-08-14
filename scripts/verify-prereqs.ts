// scripts/verify-prereqs.ts — CLAUDE.md §9.5
//
// The commit gate for data/prereqs.json.
//
// Run:  npx tsx scripts/verify-prereqs.ts       (cwd = repo root)
// Exit: 0 = graph is clean; 1 = do not commit this graph.
//
// §9.5: "Prints courses with prereqs that don't exist in the catalog, cycles in
// the graph, and the ten deepest chains. Hand-check those ten against the real
// catalog before trusting the bottleneck feature. If the graph is wrong, the
// demo makes false claims to a room full of registrars. EXIT NON-ZERO on a
// detected cycle or dangling prereq, so a bad graph is not committable."
//
// Why each check earns its place:
//
//   DANGLING  §11.1 walks reverse edges over `remainingRequired`; §11.3 step 1
//             gates eligibility on "prereqs satisfied by coursesTaken". A code
//             that names no real course can never be satisfied, so it silently
//             deletes a course from every schedule the app can offer. Nothing
//             on screen says why. This is the failure mode that looks like a
//             product bug and is actually a data bug.
//
//   CYCLE     §11.1 computes a LONGEST PATH. On a cycle that recursion does not
//             terminate, and §6 puts the computation client-side, so the user-
//             visible symptom is a RangeError inside a React render — a white
//             screen, on camera. bottlenecks.ts carries its own `visiting`
//             guard as defence in depth (§11.1 says so explicitly), but the
//             guard silently returns a WRONG depth. The graph must be acyclic
//             for the numbers on the bottleneck cards to mean anything.
//
//   DEPTH     The ten deepest chains are the claims the demo makes loudest
//             ("4 courses stack behind this one"). They are printed in full,
//             with titles, precisely so a human can read them against
//             catalog.gmu.edu before trusting them.
//
// GRAPH DEFINITION — the one judgement call in this file:
//   Edges = allOf ∪ every alternative in every oneOf group. Taking ALL
//   alternatives, not the cheapest one, is deliberate: it is the same edge set
//   §11.1 walks, and for a *verification* pass the question is "is any path
//   through this graph absurd", so the widest reading is the right one. It
//   makes reported depth an upper bound; that is stated in the output.
//
//   coreq is EXCLUDED from the cycle and depth graph. A corequisite is a
//   same-term relation, so it adds no term to a chain, and a mutual coreq pair
//   (lecture + its lab) is legal and would otherwise be reported as a cycle and
//   block the commit forever. coreq IS included in the dangling check, where
//   the same reasoning does not apply.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Course, PrereqGraph } from "@/lib/types";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const COURSES_PATH = DATA_DIR + "courses.json";
const PREREQS_PATH = DATA_DIR + "prereqs.json";

const TOP_N = 10;

interface Dangling {
  from: string;
  to: string;
  where: "allOf" | "oneOf" | "coreq";
}

function main(): void {
  console.log("verify-prereqs — CLAUDE.md §9.5\n");

  const courses = JSON.parse(readFileSync(COURSES_PATH, "utf8")) as Course[];
  const graph = JSON.parse(readFileSync(PREREQS_PATH, "utf8")) as PrereqGraph;

  const titles = new Map(courses.map((c) => [c.code, c.title]));
  const catalog = new Set(titles.keys());
  const codes = Object.keys(graph);

  console.log(`catalog   ${catalog.size} courses`);
  console.log(`graph     ${codes.length} rules\n`);

  // -------------------------------------------------------------------------
  // 1. Dangling references (and orphan keys)
  // -------------------------------------------------------------------------
  const dangling: Dangling[] = [];
  const orphanKeys: string[] = [];
  const selfLoops: string[] = [];

  for (const code of codes) {
    if (!catalog.has(code)) orphanKeys.push(code);
    const rule = graph[code]!;
    const check = (to: string, where: Dangling["where"]) => {
      if (!catalog.has(to)) dangling.push({ from: code, to, where });
      if (to === code) selfLoops.push(`${code} (${where})`);
    };
    for (const to of rule.allOf) check(to, "allOf");
    for (const group of rule.oneOf) for (const to of group) check(to, "oneOf");
    for (const to of rule.coreq) check(to, "coreq");
  }

  console.log("---- 1. dangling prerequisites -------------------------------");
  if (dangling.length === 0 && orphanKeys.length === 0 && selfLoops.length === 0) {
    console.log("none — every code in the graph names a real course in courses.json");
  } else {
    for (const d of dangling)
      console.log(`  DANGLING  ${d.from} → ${d.to}   (in ${d.where}; ${d.to} is not in courses.json)`);
    for (const k of orphanKeys)
      console.log(`  ORPHAN KEY  ${k} has a rule but is not in courses.json`);
    for (const s of selfLoops) console.log(`  SELF-LOOP  ${s} lists itself`);
  }

  // -------------------------------------------------------------------------
  // 2. Cycles
  // -------------------------------------------------------------------------
  // Edges: course → each course it depends on. See GRAPH DEFINITION above.
  const edges = new Map<string, string[]>();
  let edgeCount = 0;
  for (const code of codes) {
    const rule = graph[code]!;
    const outs = [...new Set([...rule.allOf, ...rule.oneOf.flat()])];
    edges.set(code, outs);
    edgeCount += outs.length;
  }
  const nodes = new Set<string>([...codes, ...[...edges.values()].flat()]);

  console.log(
    `\n---- 2. cycles ----------------------------------------------\n` +
      `graph is ${nodes.size} nodes / ${edgeCount} edges (coreq excluded — see header)`,
  );

  // Iterative DFS with an explicit stack: 689 nodes would survive recursion,
  // but an explicit stack also hands us the exact cycle path to print, which is
  // the only form of this error a human can act on.
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const colour = new Map<string, number>();
  for (const n of nodes) colour.set(n, WHITE);
  const cycles: string[][] = [];

  for (const start of nodes) {
    if (colour.get(start) !== WHITE) continue;
    const path: string[] = [];
    const stack: { node: string; i: number }[] = [{ node: start, i: 0 }];
    colour.set(start, GREY);
    path.push(start);

    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const outs = edges.get(frame.node) ?? [];
      if (frame.i < outs.length) {
        const next = outs[frame.i]!;
        frame.i += 1;
        const c = colour.get(next) ?? WHITE;
        if (c === GREY) {
          // Back edge — everything from `next` to the top of the path is a cycle.
          const at = path.indexOf(next);
          cycles.push([...path.slice(at), next]);
        } else if (c === WHITE) {
          colour.set(next, GREY);
          path.push(next);
          stack.push({ node: next, i: 0 });
        }
      } else {
        colour.set(frame.node, BLACK);
        path.pop();
        stack.pop();
      }
    }
  }

  if (cycles.length === 0) {
    console.log("none — the prerequisite graph is a DAG");
  } else {
    for (const c of cycles) console.log("  CYCLE  " + c.join(" → "));
  }

  // -------------------------------------------------------------------------
  // 3. Ten deepest chains
  // -------------------------------------------------------------------------
  // Longest path, memoised, with the `visiting` guard §11.1 mandates: a memo
  // written only after the recursive call returns never terminates on a cycle,
  // and this script must still produce a readable report on a BROKEN graph —
  // that is the graph it exists to describe.
  const depth = new Map<string, number>();
  const via = new Map<string, string | null>();
  const visiting = new Set<string>();

  function longest(node: string): number {
    const memo = depth.get(node);
    if (memo !== undefined) return memo;
    if (visiting.has(node)) return 0; // back edge; cycle already reported above
    visiting.add(node);

    let best = 0;
    let bestVia: string | null = null;
    for (const next of edges.get(node) ?? []) {
      const d = longest(next) + 1;
      if (d > best) {
        best = d;
        bestVia = next;
      }
    }

    visiting.delete(node);
    depth.set(node, best);
    via.set(node, bestVia);
    return best;
  }

  for (const n of nodes) longest(n);

  const ranked = [...nodes]
    .map((n) => ({ code: n, d: depth.get(n) ?? 0 }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d || a.code.localeCompare(b.code))
    .slice(0, TOP_N);

  console.log(
    `\n---- 3. ${TOP_N} deepest chains ------------------------------------\n` +
      "depth is in EDGES (a course with no prereqs is 0) and is an UPPER BOUND:\n" +
      "it follows the longest alternative in every oneOf group. Hand-check these\n" +
      "against catalog.gmu.edu before trusting the bottleneck cards (§9.5).\n",
  );
  let rank = 1;
  for (const { code, d } of ranked) {
    const chain: string[] = [code];
    let cur: string | null = code;
    const guard = new Set<string>([code]);
    while (cur) {
      const next: string | null = via.get(cur) ?? null;
      if (!next || guard.has(next)) break;
      guard.add(next);
      chain.push(next);
      cur = next;
    }
    console.log(
      `${String(rank).padStart(2)}. depth ${d}  ${code} — ${titles.get(code) ?? "(not in catalog)"}`,
    );
    console.log(`      ${chain.slice().reverse().join("  →  ")}`);
    rank += 1;
  }

  // -------------------------------------------------------------------------
  // 4. Informational: coreq relations (never a failure)
  // -------------------------------------------------------------------------
  const coreqPairs: string[] = [];
  for (const code of codes) {
    for (const c of graph[code]!.coreq) coreqPairs.push(`${code} ⇄ ${c}`);
  }
  console.log(
    `\n---- 4. corequisites (informational) -------------------------\n` +
      `${coreqPairs.length} coreq relation(s): ${coreqPairs.join(", ") || "none"}`,
  );

  // -------------------------------------------------------------------------
  const fatal =
    dangling.length + orphanKeys.length + selfLoops.length + cycles.length;
  console.log("\n---- verdict -------------------------------------------------");
  if (fatal === 0) {
    console.log("PASS — graph is acyclic and fully resolvable. Safe to commit.");
    return;
  }
  console.error(
    `FAIL — ${dangling.length} dangling, ${orphanKeys.length} orphan key(s), ` +
      `${selfLoops.length} self-loop(s), ${cycles.length} cycle(s).`,
  );
  console.error("Do not commit this graph (§9.5). Re-run scripts/parse-prereqs.ts.");
  process.exit(1);
}

main();
