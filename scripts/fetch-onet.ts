// scripts/fetch-onet.ts — CLAUDE.md §9.3
//
// O*NET Detailed Work Activities → data/onet-dwa.json (Skill[]).
//
// Run:  npx tsx scripts/fetch-onet.ts        (cwd = repo root)
//
// WHY this script exists at all, and why it is this boring:
//   - §9.3 pins O*NET **20.1**. Syllabus2O*NET — the method §17 says we adapt —
//     produces a vector of size 2,070, and 2,070 IS the 20.1 DWA vocabulary.
//     Staying on 20.1 keeps parity with the paper, which is the clean answer if
//     a judge asks about dataset vintage. So the URL below is version-pinned and
//     must not be bumped casually.
//   - §9.3: "zero new dependencies." O*NET publishes the same table as .xlsx.
//     We take the tab-delimited .txt precisely so no xlsx parser enters the tree.
//   - §9.3: commit the raw .txt alongside the JSON, "the cheapest insurance in
//     the project" — if O*NET ever moves or re-versions that URL, the build
//     still reproduces from the committed copy instead of dying on a 404.
//
// This script makes NO OpenAI call and needs no API key. Embedding the DWA names
// is a separate step (§9.4, scripts/embed-skills.ts).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Skill } from "@/lib/types";

// §17 REFERENCE. Version-pinned to db_20_1 on purpose — see header comment.
const DWA_URL =
  "https://www.onetcenter.org/dl_files/database/db_20_1_text/DWA%20Reference.txt";

// Resolved from this file, not from process.cwd(), so the script cannot quietly
// write data/ into whatever directory it happened to be invoked from.
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const RAW_PATH = DATA_DIR + "DWA Reference.txt";
const JSON_PATH = DATA_DIR + "onet-dwa.json";

// The header row of O*NET 20.1's DWA Reference, verified live on Aug 13 2026:
//   Element ID <TAB> IWA ID <TAB> DWA ID <TAB> DWA Title
// §9.3 quotes cols[2]/cols[3] from memory; we assert the names rather than trust
// the indices. A future O*NET release that inserts a column would otherwise
// silently write 2,070 rows of IWA ids into skillId — a file that looks fine,
// passes every downstream type check, and poisons the entire gap map.
const EXPECTED_HEADER = ["Element ID", "IWA ID", "DWA ID", "DWA Title"];
const COL_DWA_ID = 2;
const COL_DWA_TITLE = 3;

// §9.3 / §17: O*NET 20.1 contains exactly 2,070 DWAs. Not a hard failure (a
// legitimate future bump would trip it) but it must be shouted, because the
// 2,070 figure is the parity claim we make out loud about Syllabus2O*NET.
const EXPECTED_ROWS = 2070;

async function loadRaw(): Promise<{ text: string; source: string }> {
  try {
    const res = await fetch(DWA_URL, {
      // Be identifiable rather than anonymous — same politeness posture §9.1
      // sets for the GMU scrapers. One request, one time, no crawl.
      headers: {
        "User-Agent":
          "reverse-audit/0.1 (Stellic Pathfinders hackathon; one-time O*NET reference fetch)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return { text: await res.text(), source: DWA_URL };
  } catch (err) {
    // The committed raw .txt earns its keep here: an offline machine, a blocked
    // egress, or an O*NET URL bump all degrade to a reproducible local parse
    // instead of a broken build. Only the fetch is allowed to fail this way —
    // if there is no committed copy either, we stop loudly.
    const why = err instanceof Error ? err.message : String(err);
    if (!existsSync(RAW_PATH)) {
      throw new Error(
        `fetch failed (${why}) and no committed copy at "${RAW_PATH}". ` +
          `Restore data/DWA Reference.txt from git or re-run with network access.`,
      );
    }
    console.warn(`! fetch failed (${why}) — falling back to committed raw copy`);
    return { text: readFileSync(RAW_PATH, "utf8"), source: RAW_PATH };
  }
}

function parse(text: string): Skill[] {
  // \r?\n because the file is served with CRLF; a naive split('\n') leaves a
  // trailing \r glued to every DWA Title, which is invisible in a terminal and
  // shows up later as a stray gap in a UI chip.
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0];
  if (!header) throw new Error("empty file: no header row");

  const headerCols = header.split("\t");
  console.log(`  header  : ${headerCols.map((c) => `"${c}"`).join(" | ")}`);

  const mismatch = EXPECTED_HEADER.some((name, i) => headerCols[i] !== name);
  if (mismatch) {
    throw new Error(
      `unexpected header layout.\n  expected: ${EXPECTED_HEADER.join(" | ")}\n` +
        `  actual  : ${headerCols.join(" | ")}\n` +
        `Column positions in §9.3 no longer hold — fix the indices before rerunning.`,
    );
  }

  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    const skillId = cols[COL_DWA_ID]?.trim();
    const skillName = cols[COL_DWA_TITLE]?.trim();
    if (!skillId || !skillName) {
      console.warn(`! row ${i}: missing DWA id or title — skipped`);
      continue;
    }
    // One DWA maps to exactly one row in 20.1, but dedupe anyway: a duplicate
    // skillId would double-count demand in §11.2's SkillGap.demandCount.
    if (seen.has(skillId)) {
      console.warn(`! row ${i}: duplicate DWA id ${skillId} — skipped`);
      continue;
    }
    seen.add(skillId);
    // §8 NAMING RULE, no exceptions: skill fields are skillId / skillName.
    skills.push({ skillId, skillName });
  }

  return skills;
}

async function main() {
  console.log(`fetching ${DWA_URL}`);
  const { text, source } = await loadRaw();
  console.log(`  source  : ${source}`);
  console.log(`  bytes   : ${Buffer.byteLength(text, "utf8")}`);

  mkdirSync(DATA_DIR, { recursive: true });

  // Write the raw bytes back verbatim (line endings included) BEFORE parsing, so
  // even a parse failure leaves the insurance copy on disk to debug against.
  writeFileSync(RAW_PATH, text, "utf8");
  console.log(`  wrote   : ${RAW_PATH}`);

  const skills = parse(text);

  // §9.3 asks for the header and the first rows to be eyeballed, not assumed.
  console.log("  first 3 :");
  for (const s of skills.slice(0, 3)) {
    console.log(`    ${s.skillId}  ${s.skillName}`);
  }

  if (skills.length === 0) {
    throw new Error("parsed 0 DWAs — refusing to overwrite data/onet-dwa.json");
  }
  if (skills.length !== EXPECTED_ROWS) {
    console.warn(
      `! parsed ${skills.length} DWAs, expected ${EXPECTED_ROWS} for O*NET 20.1. ` +
        `The 2,070 figure is a claim we make out loud (§9.3/§17) — reconcile it ` +
        `before citing the Syllabus2O*NET parity argument.`,
    );
  }

  writeFileSync(JSON_PATH, JSON.stringify(skills, null, 2) + "\n", "utf8");
  console.log(`  wrote   : ${JSON_PATH}  (${skills.length} skills)`);

  // §9.3 attribution is a LICENSE CONDITION, not a courtesy. It belongs in
  // TOOLS.md and README — and explicitly NOT in the §13 footer, which is doing
  // advisor-disclaimer work.
  console.log(
    '\nREMINDER — TOOLS.md + README must carry: "Includes information from the ' +
      "O*NET 20.1 Database by the U.S. Department of Labor, Employment and " +
      "Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. " +
      'O*NET is a trademark of USDOL/ETA."',
  );
}

main().catch((err) => {
  console.error("fetch-onet failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
