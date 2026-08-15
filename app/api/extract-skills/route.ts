// POST /api/extract-skills — CLAUDE.md §12.2
//
// Body: { postings: string[] }
// Returns: { skills: { skillId, skillName, demandCount, postings }[], degraded }
//
// `postings` holds the INDICES of the pasted postings that asked for each
// skill, and it is load-bearing rather than decorative: §11.3's
// `keeps-options-open` strategy maximizes the union of those indices across the
// skills a combo closes. §18 finding 4 — `demandCount` is a cardinality and
// cannot be inverted back into a membership set, so without this field the
// third schedule card silently renders a duplicate of the first, on the screen
// that owns the largest block of the demo video.
//
// Like every route in §12, this one never returns 500. On any failure it logs
// and serves the cached fixture with `degraded: true`.

import { isUndergraduate } from "@/lib/bottlenecks";
import { callStructured } from "@/lib/openai";
import { extractedSkillsSchema, type ExtractedSkills } from "@/lib/schemas";
import type { CatalogSkills, Skill, SkillGap } from "@/lib/types";
import catalogSkillsJson from "@/data/catalog-skills.json";
import onetDwaJson from "@/data/onet-dwa.json";
import fallbackResponse from "@/samples/fallback-response.json";

export const runtime = "nodejs";

/** What this route puts on the wire. Not a new contract — it is the front half
 *  of §8's SkillGap, which lib/gaps.ts completes client-side. */
type DemandedSkill = Pick<SkillGap, "skillId" | "skillName" | "demandCount"> & {
  postings: number[];
};

const FALLBACK = fallbackResponse["extract-skills"] as unknown as {
  skills: DemandedSkill[];
  degraded: boolean;
};

const catalogSkills = catalogSkillsJson as CatalogSkills;
const onetDwa = onetDwaJson as Skill[];

// ---------------------------------------------------------------------------
// PROMPT SCOPING — §12.2.
//
// Pass ONLY the DWAs that some course in data/catalog-skills.json actually
// teaches, not all 2,070 in the O*NET release. A demanded skill that no scoped
// course teaches can never appear in SkillGap.closableBy, so it is pure noise
// on the gap map AND it costs ~40k prompt tokens to offer. This cuts the list
// to a few hundred and materially improves selection accuracy.
//
// Built once per cold start from static imports — §6 forbids fs.readFile here,
// because a runtime path off process.cwd() is not reliably traced into the
// Vercel bundle and resolves to /var/task inside a Lambda.
// ---------------------------------------------------------------------------

const dwaNameById = new Map(onetDwa.map((d) => [d.skillId, d.skillName]));

const scopedSkills: Skill[] = (() => {
  const ids = new Set<string>();
  for (const code of Object.keys(catalogSkills)) {
    // Undergraduate courses only, matching lib/gaps.ts, which already applies
    // `isUndergraduate` when it fills SkillGap.closableBy. Without the same
    // filter here the two disagree, and the disagreement is user-visible and
    // WRONG: a DWA taught only by MATH 776 or PHYS 685 could be demanded, but
    // gaps.ts would find no course able to close it, so the chip rendered as
    // "needs a prereq first" — a false explanation. It is not behind a
    // prerequisite, it is behind a graduate course the student cannot take.
    // This is also where "Measure dimensions of completed products or
    // workpieces" was entering an undergraduate's gap map, via MATH 776.
    if (!isUndergraduate(code)) continue;
    for (const s of catalogSkills[code] ?? []) ids.add(s.skillId);
  }
  return [...ids]
    .map((skillId) => ({ skillId, skillName: dwaNameById.get(skillId) ?? "" }))
    .filter((s) => s.skillName !== "")
    .sort((a, b) => a.skillName.localeCompare(b.skillName));
})();

/**
 * name → id, over the scoped list only. This is the resolver that replaces the
 * old `scopedIds.has(...)` check; see the header comment on
 * `extractedSkillSchema` for why the name is the key and the id is derived.
 * DWA titles are unique across the whole O*NET release, so this cannot collide.
 */
const scopedIdByName = new Map(scopedSkills.map((s) => [s.skillName, s.skillId]));

// The list below is NAMES ONLY — no ids. The id is dead weight in the prompt
// (it is ~19 chars x 1,100 rows) and, worse, offering it invites the model to
// pair a name with the wrong one. See `extractedSkillSchema`.
const SYSTEM = `You read job postings and identify which O*NET Detailed Work Activities (DWAs) each posting is asking for.

You are given a fixed catalog of allowed DWAs below. Follow these rules exactly:

1. "skillName" MUST be copied character-for-character from the allowed list below, including its trailing period. Never invent a name, never reword one, never merge two, never return anything that is not on the list. A name that is not on the list verbatim is discarded, so a near-miss is the same as returning nothing.
2. For each skill you return, "postings" is the list of ZERO-BASED indices of the postings that asked for it. A posting counts if it names the activity in its responsibilities, its qualifications, or its preferred qualifications.
3. One entry per distinct skill. Do not emit the same name twice — merge the indices instead.
4. Judge on substance, not vocabulary. "Write SQL against our warehouse daily" is database work; "defend a confidence interval" is statistical analysis; "read a query plan" is not the same activity as "build a dashboard".
5. Return AT MOST 20 skills. There is NO MINIMUM. Six precise activities beat twelve where six were forced. Prefer the activities the postings actually spend words on.
6. Do not return many near-duplicate variants of one activity. If several allowed names differ only in their object ("... operational data", "... research data", "... traffic data"), pick the single best fit and move on. Twenty shades of one verb is a failed answer.
7. If a requirement has no genuine match in the allowed list, OMIT it. Never settle for the nearest available name. A wrong match is far worse than a missing one: each returned skill is what the schedule builder then tries to close, so one bad mapping puts an unrelated course on the student's schedule with a real CRN next to it.
8. Never map a technical requirement onto an activity from an unrelated professional domain — creative writing, construction, food service, healthcare, performing arts, manufacturing — merely because a word overlaps. "Builds data pipelines" is not "Prepare production storyboards." If the closest allowed activity comes from a different domain than the posting, that is a signal to OMIT, not to match.

ALLOWED DWA NAMES (one per line, copy verbatim):
${scopedSkills.map((s) => s.skillName).join("\n")}`;

/** Postings are pasted by hand and can be long; keep the request well clear of
 *  a `finish_reason === "length"` truncation, which callStructured throws on. */
const MAX_POSTING_CHARS = 8_000;
const MAX_POSTINGS = 6;

/**
 * One model response → the wire shape, with both guards applied. Shared by the
 * first pass and the retry so the two cannot validate differently.
 */
function harvest(
  result: ExtractedSkills,
  validIndices: Set<number>,
): DemandedSkill[] {
  const merged = new Map<string, DemandedSkill>();

  for (const s of result.skills ?? []) {
    // Hallucination guard, and now an effective one. An EXACT match against the
    // scoped names is the only way in: an invented name resolves to nothing and
    // is dropped, where the old id-based check would have waved through a real
    // id that the model had mislabelled and silently renamed it on the way out.
    const skillId = scopedIdByName.get(s.skillName?.trim() ?? "");
    if (!skillId) continue;

    const indices = (s.postings ?? []).filter((i) => validIndices.has(i));
    if (indices.length === 0) continue;

    const existing = merged.get(skillId);
    const union = new Set([...(existing?.postings ?? []), ...indices]);
    merged.set(skillId, {
      skillId,
      // Canonical, never the model's copy — the lookup above already proved the
      // two are identical, and reading it back from the id keeps §9.3's
      // guarantee that DWA names ship VERBATIM under CC BY 4.0.
      skillName: dwaNameById.get(skillId) as string,
      // Derived, never the model's arithmetic — demandCount and postings
      // disagreeing would put a "3 of 3 roles" chip next to a 1-role gap.
      demandCount: union.size,
      postings: [...union].sort((a, b) => a - b),
    });
  }

  return [...merged.values()].sort(
    (a, b) => b.demandCount - a.demandCount || a.skillName.localeCompare(b.skillName),
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const body: unknown = await req.json();
    const raw = (body as { postings?: unknown } | null)?.postings;
    if (!Array.isArray(raw)) throw new Error("body.postings must be a string array");

    // Keep the ORIGINAL index of every posting we send. The client numbers its
    // three textareas 0/1/2, and `postings` indices are read straight back
    // against that numbering — silently re-indexing after dropping a blank box
    // would attribute a skill to the wrong job.
    const kept = raw
      .map((p, index) => ({ index, text: typeof p === "string" ? p.trim() : "" }))
      .filter((p) => p.text.length > 0)
      .slice(0, MAX_POSTINGS);

    if (kept.length === 0) throw new Error("every posting was empty");

    const user = kept
      .map((p) => `### POSTING INDEX ${p.index}\n${p.text.slice(0, MAX_POSTING_CHARS)}`)
      .join("\n\n");

    const prompt = `${user}\n\nReturn the DWAs these postings ask for, using the zero-based POSTING INDEX values shown above.`;
    const validIndices = new Set(kept.map((p) => p.index));

    let skills = harvest(
      await callStructured<ExtractedSkills>(
        SYSTEM,
        prompt,
        extractedSkillsSchema,
        "extracted_skills",
      ),
      validIndices,
    );

    // ONE retry, and only on the empty set.
    //
    // Rules 7-9 above push hard toward omission on purpose — §19 records that an
    // earlier "between 8 and 20 skills" floor forced the model to pad, which put
    // ENGH 492 Advanced Fiction Writing Workshop on a backend engineer's
    // schedule. Removing the floor fixed that and made the empty set reachable,
    // and the empty set used to fall straight through to the cached fixture:
    // the student would silently be shown skills extracted from somebody else's
    // two job postings. §19 already settled that trade for /api/build-schedules
    // — a stranger's data is a worse degradation than an honest local one.
    //
    // The retry is a genuine second sample, not the same request again: see the
    // comment in lib/openai.ts for why temperature is deliberately left at the
    // API default, which is also what makes a plain re-ask worth anything. The
    // nudge deliberately states NO minimum — it re-opens the door rather than
    // pushing anything through it, because a floor is what caused the padding.
    if (skills.length === 0) {
      console.warn("[extract-skills] empty first pass, retrying once");
      skills = harvest(
        await callStructured<ExtractedSkills>(
          SYSTEM,
          `${prompt}\n\nA previous attempt returned no skills at all. For postings like these that is almost certainly wrong — the allowed list above contains software, data and analysis activities. Re-read the postings and return every allowed activity that genuinely matches. Do NOT lower your standard for a match and do NOT return anything from an unrelated domain; if the honest answer really is none, an empty list is still acceptable.`,
          extractedSkillsSchema,
          "extracted_skills",
        ),
        validIndices,
      );
    }

    if (skills.length === 0) throw new Error("model returned no usable skills");

    return Response.json({ skills, degraded: false });
  } catch (err) {
    console.error("[extract-skills] serving cached fixture:", err);
    return Response.json({ skills: FALLBACK.skills, degraded: true });
  }
}
