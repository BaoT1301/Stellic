// Reverse Audit — grounding context for the assistant.
//
// CLAUDE.md §5 closed "free-form chat interface". The owner of that decision has
// since overridden it and asked for the assistant directly, twice. This file is
// what makes that safe to say yes to: the model is never given the catalog, it
// is given a fixed, factual block built HERE from the student's own parsed audit
// and the numbers lib/bottlenecks.ts, lib/gaps.ts and lib/schedules.ts already
// computed. If a fact is not in this block, the correct answer is "I don't have
// that", and the route's system prompt says exactly that.
//
// Everything here is PURE and synchronous. No I/O, no imports from `app/`, no
// React. Both the client (components/ChatPanel.tsx) and the server
// (app/api/chat/route.ts) import it, which is deliberate: the same function that
// writes the model's context also writes the DEGRADED answer, so a dead
// OPENAI_API_KEY produces a different sentence, never a different fact.

import { normalizeCode } from "@/lib/bottlenecks";
import {
  NEXT_TERM_BANNER_CODE,
  NEXT_TERM_LABEL,
  type Bottleneck,
  type ScheduleOption,
  type Section,
  type SkillGap,
  type StudentAudit,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// The contract with the page
// ---------------------------------------------------------------------------

/**
 * Everything the assistant is allowed to know.
 *
 * This is a VIEW over state app/page.tsx already holds, not a new source of
 * truth: every field is passed in by the orchestrator. ChatPanel takes one of
 * these as a prop and POSTs it verbatim, so there is exactly one place a fact
 * can enter the conversation.
 *
 * Deliberately NOT added to lib/types.ts — §12.3, the frozen contracts are the
 * ones two people build against, and this one is local to the chat feature.
 */
export interface ChatContext {
  /** The parsed degree audit. Null before step 2 completes. */
  audit: StudentAudit | null;
  /** §11.1 output, already sorted by urgency then chain depth. */
  bottlenecks: Bottleneck[];
  /** §11.2 output, every demanded skill, covered and open. */
  gaps: SkillGap[];
  /** §11.3 output after prose. Zero, two or three of them. */
  options: ScheduleOption[];
  /** course code -> title, for courses named outside a schedule card. */
  titles?: Record<string, string>;
  /** How many job postings the student actually pasted. */
  postingCount?: number;
}

/** Card letters, byte-identical to LETTERS in components/ScheduleOptions.tsx.
 *  A judge reading "Option B" on a card and "Option B" in an answer is the
 *  whole point; two different letterings would be a real defect. */
const LETTERS = ["A", "B", "C", "D"];

/**
 * ~6000 tokens is the ceiling the brief set. English averages a little under
 * four characters per token, and this block is unusually dense in course codes
 * and digits, which tokenize worse than prose. 20k characters is the
 * conservative read of that budget, and `serializeChatContext` truncates every
 * list with an explicit count long before it gets here.
 */
export const CHAT_CONTEXT_CHAR_BUDGET = 20_000;

// Per-section list caps. Chosen so a realistic audit (40+ courses taken, 12
// requirements, 20 demanded skills, three options) never reaches the global
// clamp, and a pathological one degrades by counting rather than by silence.
const MAX_COURSES_TAKEN = 40;
const MAX_REQUIREMENTS = 14;
const MAX_MISSING_PER_REQUIREMENT = 10;
const MAX_BOTTLENECKS = 14;
const MAX_DEPENDENTS = 8;
const MAX_COVERED_GAPS = 10;
const MAX_REACHABLE_GAPS = 14;
const MAX_BLOCKED_GAPS = 8;
const MAX_CLOSABLE_BY = 5;
const MAX_OPTIONS = 4;
const MAX_COURSES_PER_OPTION = 8;

// ---------------------------------------------------------------------------
// Small shared formatters
// ---------------------------------------------------------------------------

/** "13:30" -> "1:30 pm". Same conversion ScheduleCard renders, so the answer
 *  and the card cannot print different times for one CRN. */
export function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || m === undefined) return hhmm;
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

/**
 * §9.1: Banner writes Time="TBA" and Days="&nbsp;" for asynchronous sections and
 * the scraper normalises both to "". Anything that reads startTime has to honour
 * that or the 12h converter emits "NaN:NaN" — here it would emit it into a
 * sentence the model then repeats as fact.
 */
export function formatMeeting(section: Section): string {
  if (!section || section.days === "" || section.startTime === "") {
    return "asynchronous, no set meeting time";
  }
  return `${section.days} ${formatTime12h(section.startTime)} to ${formatTime12h(section.endTime)}`;
}

/** "+N more" rather than a silently shorter list. A truncated list the model
 *  cannot see the end of is how a model starts guessing what was in it. */
function cap<T>(items: T[], limit: number): { shown: T[]; hidden: number } {
  const list = Array.isArray(items) ? items : [];
  return {
    shown: list.slice(0, limit),
    hidden: Math.max(0, list.length - limit),
  };
}

function withCount(items: string[], limit: number): string {
  const { shown, hidden } = cap(items, limit);
  if (shown.length === 0) return "none";
  return hidden > 0
    ? `${shown.join(", ")} (+${hidden} more not listed here)`
    : shown.join(", ");
}

/** "1 posting" / "2 postings". Never "1 posting(s)": this text is read out loud
 *  in a demo and printed next to real numbers, and a placeholder plural is the
 *  cheapest possible tell that nobody read the output. */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * O*NET Detailed Work Activity names are full sentences and END IN A PERIOD
 * ("Analyze data to identify trends or relationships."). §9.3 requires them
 * VERBATIM, so they are never edited to fit: they are quoted, and every sentence
 * that uses one puts it last, where its own period terminates the sentence.
 * That is what keeps "...relationships.." off the screen without touching the
 * string the CC BY attribution covers.
 */
function quoteSkill(name: string): string {
  return `"${name}"`;
}

/** Never trust a prop that came through a network boundary. The route parses
 *  this object out of a request body, so every array here is attacker-shaped
 *  until proven otherwise. */
export function normalizeContext(context: ChatContext | null | undefined): ChatContext {
  const c = context ?? ({} as ChatContext);
  return {
    audit: c.audit ?? null,
    bottlenecks: Array.isArray(c.bottlenecks) ? c.bottlenecks : [],
    gaps: Array.isArray(c.gaps) ? c.gaps : [],
    options: Array.isArray(c.options) ? c.options : [],
    titles: c.titles && typeof c.titles === "object" ? c.titles : {},
    postingCount: typeof c.postingCount === "number" ? c.postingCount : undefined,
  };
}

/** Is there enough here to answer anything at all? ChatPanel renders nothing
 *  when this is false, so the feature cannot appear as an empty box on camera. */
export function hasGrounding(context: ChatContext | null | undefined): boolean {
  const c = normalizeContext(context);
  return c.audit !== null || c.options.length > 0 || c.bottlenecks.length > 0;
}

/** Counts for the panel's provenance line. Every number the UI prints about
 *  itself comes from here, so the line cannot drift from the block. */
export function contextFacts(context: ChatContext): {
  requirements: number;
  blockers: number;
  skills: number;
  schedules: number;
  sections: number;
} {
  const c = normalizeContext(context);
  const sections = new Set<string>();
  for (const option of c.options) {
    for (const row of option.courses ?? []) {
      if (row?.section?.crn) sections.add(row.section.crn);
    }
  }
  return {
    requirements: c.audit?.requirements?.length ?? 0,
    blockers: c.bottlenecks.length,
    skills: c.gaps.length,
    schedules: c.options.length,
    sections: sections.size,
  };
}

// ---------------------------------------------------------------------------
// THE CONTEXT BLOCK
// ---------------------------------------------------------------------------

/**
 * Serialise the student's whole situation into one factual block.
 *
 * Written as flat labelled lines rather than JSON on purpose: JSON spends a
 * third of the budget on punctuation and keys, and a model asked to quote a
 * meeting time back to a student reproduces `MW 1:30 pm to 2:45 pm` more
 * reliably than `{"days":"MW","startTime":"13:30"}`.
 */
export function serializeChatContext(context: ChatContext): string {
  const c = normalizeContext(context);
  const out: string[] = [];

  out.push(
    `CONTEXT. This is the entire set of facts you may use. It is the student's own parsed degree audit plus the public George Mason University catalog and the public ${NEXT_TERM_LABEL} schedule of classes (Banner term ${NEXT_TERM_BANNER_CODE}). Anything not written below, you do not know.`,
  );

  // -- audit ---------------------------------------------------------------
  out.push("\n== DEGREE AUDIT ==");
  if (!c.audit) {
    out.push("The student has not uploaded a degree audit yet.");
  } else {
    const a = c.audit;
    out.push(`Major: ${a.major || "not stated on the audit"}`);
    out.push(`Catalog year: ${a.catalogYear ?? "not stated on the audit"}`);
    out.push(
      `Credits: ${a.creditsCompleted} completed of ${a.creditsRequired} required`,
    );
    out.push(
      `Expected graduation: ${a.expectedGraduation ?? "not stated on the audit"}`,
    );
    // All bottlenecks share one termsRemaining (§11.1 computes it once from the
    // audit), so quoting the first is exact rather than representative.
    const terms = c.bottlenecks[0]?.termsRemaining;
    if (typeof terms === "number") {
      out.push(
        `Fall and spring terms remaining, including ${NEXT_TERM_LABEL}: ${terms} (summer is never counted as plannable)`,
      );
    }

    const taken = (a.coursesTaken ?? []).map(normalizeCode);
    out.push(
      `Courses already completed (${taken.length}): ${withCount(taken, MAX_COURSES_TAKEN)}`,
    );

    const reqs = cap(a.requirements ?? [], MAX_REQUIREMENTS);
    out.push("Requirements:");
    for (const r of reqs.shown) {
      const missing =
        (r.missing ?? []).length > 0
          ? `still needs ${withCount((r.missing ?? []).map(normalizeCode), MAX_MISSING_PER_REQUIREMENT)}`
          : "no specific named courses outstanding";
      const slots =
        r.slotsOpen > 0
          ? `${r.slotsOpen} elective slot${r.slotsOpen === 1 ? "" : "s"} open`
          : "no open elective slots";
      out.push(`- ${r.name}: ${r.status}; ${missing}; ${slots}; ${r.credits} credits`);
    }
    if (reqs.hidden > 0) {
      out.push(`- (+${reqs.hidden} more requirements not listed here)`);
    }
    out.push(
      "NOTE: the audit records which courses were completed, not the grades. Never claim a minimum-grade prerequisite is satisfied; say the prerequisite courses are completed.",
    );
  }

  // -- bottlenecks ---------------------------------------------------------
  out.push("\n== COURSES THAT BLOCK OTHER COURSES ==");
  out.push(
    "Computed from the published prerequisite graph, restricted to courses this student still needs. chain depth is measured in prerequisite edges behind the course.",
  );
  const bottlenecks = cap(c.bottlenecks, MAX_BOTTLENECKS);
  if (bottlenecks.shown.length === 0) {
    out.push("None computed.");
  }
  for (const b of bottlenecks.shown) {
    const behind =
      (b.dependents ?? []).length > 0
        ? ` still-needed courses behind it: ${withCount(b.dependents ?? [], MAX_DEPENDENTS)};`
        : "";
    const plannable = (b.termsOffered ?? []).filter((t) => t !== "summer");
    const offered =
      plannable.length === 0
        ? "no fall or spring offering on record"
        : `offered ${plannable.join(" and ")}`;
    out.push(
      `- ${normalizeCode(b.code)} ${b.title}: urgency ${b.urgency}; ${b.reason}; chain depth ${b.chainDepth};${behind} ${offered}`,
    );
  }
  if (bottlenecks.hidden > 0) {
    out.push(`- (+${bottlenecks.hidden} more not listed here)`);
  }
  out.push(
    'URGENCY MEANING: "critical" = leaving it until later pushes the courses behind it past the expected graduation date. "soon" = it should be taken this term or next. "flexible" = still required, but the timing is not what is forcing the plan.',
  );

  // -- skills --------------------------------------------------------------
  const covered = c.gaps.filter((g) => g.covered);
  const reachable = c.gaps.filter((g) => !g.covered && (g.closableBy ?? []).length > 0);
  const blocked = c.gaps.filter((g) => !g.covered && (g.closableBy ?? []).length === 0);

  out.push("\n== SKILLS THE PASTED JOB POSTINGS ASKED FOR ==");
  out.push(
    `Skill names are O*NET Detailed Work Activities matched to course descriptions, quoted verbatim.${
      c.postingCount ? ` The student pasted ${plural(c.postingCount, "posting")}.` : ""
    } ${c.gaps.length} demanded skills in total: ${covered.length} already covered, ${reachable.length} open and closable by a course offered next term, ${blocked.length} open with no course the student can take next term.`,
  );

  if (covered.length > 0) {
    out.push(
      `ALREADY COVERED (by a course taken, or by a course still required, so an elective should not be spent on these) (${covered.length}):`,
    );
    const shown = cap(covered, MAX_COVERED_GAPS);
    for (const g of shown.shown) {
      out.push(
        `- covered by ${withCount(g.coveredBy ?? [], 4)} -> ${quoteSkill(g.skillName)}`,
      );
    }
    if (shown.hidden > 0) out.push(`- (+${shown.hidden} more not listed here)`);
  }

  if (reachable.length > 0) {
    out.push(`OPEN, AND A COURSE OFFERED NEXT TERM WOULD CLOSE IT (${reachable.length}):`);
    const shown = cap(reachable, MAX_REACHABLE_GAPS);
    for (const g of shown.shown) {
      out.push(
        `- asked for by ${plural(g.demandCount, "posting")}; closable by ${withCount(g.closableBy ?? [], MAX_CLOSABLE_BY)} -> ${quoteSkill(g.skillName)}`,
      );
    }
    if (shown.hidden > 0) out.push(`- (+${shown.hidden} more not listed here)`);
  }

  if (blocked.length > 0) {
    out.push(
      `OPEN, BUT PREREQUISITE BLOCKED (every course that teaches it needs a prerequisite the student has not completed) (${blocked.length}):`,
    );
    const shown = cap(blocked, MAX_BLOCKED_GAPS);
    for (const g of shown.shown) {
      out.push(`- asked for by ${plural(g.demandCount, "posting")} -> ${quoteSkill(g.skillName)}`);
    }
    if (shown.hidden > 0) out.push(`- (+${shown.hidden} more not listed here)`);
  }

  // -- schedules -----------------------------------------------------------
  out.push(`\n== THE ${NEXT_TERM_LABEL.toUpperCase()} SCHEDULE OPTIONS ==`);
  out.push(
    "These were generated deterministically in code from the requirements, the prerequisite graph and the published meeting times. A language model did not choose any course. Every CRN below is a real, registerable section.",
  );
  const options = cap(c.options, MAX_OPTIONS);
  if (options.shown.length === 0) {
    out.push("The student has not built their schedule options yet.");
  }
  options.shown.forEach((option, i) => {
    const letter = LETTERS[i] ?? String(i + 1);
    out.push(
      `\nOPTION ${letter} "${option.label}" (strategy ${option.strategy}): ${option.totalCredits} credits; clears ${plural(option.bottlenecksCleared, "blocked course")}; closes ${option.gapsClosed} of ${option.gapsTotal} open skills; uses ${plural(option.slotsUsed, "elective slot")}.`,
    );
    if (option.why) out.push(`Why this option: ${option.why}`);
    if (option.tradeoff) out.push(`Its tradeoff: ${option.tradeoff}`);
    const rows = cap(option.courses ?? [], MAX_COURSES_PER_OPTION);
    for (const row of rows.shown) {
      // Last on the line, and quoted, because a DWA name ends in a period.
      const closes =
        (row.skillsClosed ?? []).length > 0
          ? `; closes ${withCount(
              (row.skillsClosed ?? []).map((id) =>
                quoteSkill(c.gaps.find((g) => g.skillId === id)?.skillName ?? id),
              ),
              3,
            )}`
          : "";
      out.push(
        `- ${normalizeCode(row.code)} ${row.title}: CRN ${row.section?.crn ?? "not listed"}; ${formatMeeting(row.section)}; instructor ${row.section?.instructor || "not listed"}; ${row.section?.modality ?? "not listed"}${row.isBottleneck ? "; this one is a blocker" : ""}${closes}`,
      );
    }
    if (rows.hidden > 0) out.push(`- (+${rows.hidden} more courses not listed here)`);
  });
  if (options.hidden > 0) {
    out.push(`(+${options.hidden} more options not listed here)`);
  }

  const block = out.join("\n");
  if (block.length <= CHAT_CONTEXT_CHAR_BUDGET) return block;
  // Belt and braces. Every list above is already capped, so reaching this means
  // an unusually large audit; say so rather than ending mid-sentence, because a
  // block that stops mid-fact is exactly what invites the model to finish it.
  return `${block.slice(0, CHAT_CONTEXT_CHAR_BUDGET)}\n[Context truncated here to fit. Anything cut off is unknown to you; say so rather than guessing.]`;
}

// ---------------------------------------------------------------------------
// SUGGESTED QUESTIONS
// ---------------------------------------------------------------------------

/**
 * Three one-tap questions built from THIS student's data.
 *
 * Every one of them is answerable from the block above and, more importantly,
 * answerable by `answerFromContext` below with no model at all. That is the
 * demo-safety property: a judge taps a chip, and the panel produces a true,
 * specific answer whether or not the key works, whether or not there is a
 * network. Order is stable so the same audit always shows the same three.
 */
export function suggestedQuestions(context: ChatContext): string[] {
  const c = normalizeContext(context);
  const questions: string[] = [];

  const urgent =
    c.bottlenecks.find((b) => b.urgency === "critical") ??
    c.bottlenecks.find((b) => b.urgency === "soon") ??
    c.bottlenecks[0];

  if (urgent) {
    const code = normalizeCode(urgent.code);
    questions.push(`Why is ${code} urgent?`);
    questions.push(`What happens if I skip ${code} this term?`);
  }

  // The elective is the only real decision on the screen (§11.3 step 2 puts the
  // same criticals on every option), so the third chip asks about it.
  const elective = c.options
    .flatMap((o) => o.courses ?? [])
    .find((row) => !row.isBottleneck && (row.skillsClosed ?? []).length > 0);
  const anyElective = c.options.flatMap((o) => o.courses ?? []).find((r) => !r.isBottleneck);
  const chosen = elective ?? anyElective;

  if (chosen) {
    questions.push(`What does ${normalizeCode(chosen.code)} give me?`);
  }

  // Fillers, in priority order, for a student whose data is thinner than the
  // demo student's. Only ever used to reach three.
  const fillers = [
    c.options.length > 1 ? "What is the difference between the options?" : null,
    c.options.length > 0 ? "How many credits is Option A?" : null,
    c.gaps.some((g) => !g.covered)
      ? "Which skills are my postings asking for that I am not getting?"
      : null,
    c.audit ? "What am I still missing for my degree?" : null,
    "What can you tell me about my plan?",
  ].filter((q): q is string => q !== null);

  for (const f of fillers) {
    if (questions.length >= 3) break;
    if (!questions.includes(f)) questions.push(f);
  }

  return questions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// THE DEGRADED ANSWER
// ---------------------------------------------------------------------------
//
// §0 rule 3: every feature degrades to something that still renders. For a
// grounded assistant the bar is higher than "renders" — a degraded answer has to
// be TRUE. So this is not a canned apology: it reads the same structures the
// model reads and writes the answer directly. On a dead key, the panel still
// answers "why is CS 262 urgent" correctly, in the student's own numbers.

const CODE_PATTERN = /\b([A-Za-z]{2,4})\s*[- ]?\s*(\d{3})\b/g;

/** Course codes mentioned in a question, restricted to codes we actually hold.
 *  Restricting is what stops "CS 475" in a question from being echoed back as
 *  though we knew something about it. */
export function extractCourseCodes(text: string, known: Set<string>): string[] {
  const found: string[] = [];
  for (const match of String(text ?? "").matchAll(CODE_PATTERN)) {
    const code = normalizeCode(`${match[1]} ${match[2]}`);
    if (known.has(code) && !found.includes(code)) found.push(code);
  }
  return found;
}

/** Every code the context can speak to, normalised. */
function knownCodes(c: ChatContext): Set<string> {
  const set = new Set<string>();
  const add = (code: string | undefined) => {
    if (code) set.add(normalizeCode(code));
  };
  for (const b of c.bottlenecks) {
    add(b.code);
    for (const d of b.dependents ?? []) add(d);
  }
  for (const o of c.options) for (const row of o.courses ?? []) add(row.code);
  for (const g of c.gaps) {
    for (const code of g.coveredBy ?? []) add(code);
    for (const code of g.closableBy ?? []) add(code);
  }
  for (const code of c.audit?.coursesTaken ?? []) add(code);
  for (const r of c.audit?.requirements ?? []) for (const code of r.missing ?? []) add(code);
  for (const code of Object.keys(c.titles ?? {})) add(code);
  return set;
}

function titleFor(c: ChatContext, code: string): string {
  const normalized = normalizeCode(code);
  const fromTitles = c.titles?.[normalized];
  if (fromTitles) return fromTitles;
  const fromBottleneck = c.bottlenecks.find((b) => normalizeCode(b.code) === normalized);
  if (fromBottleneck?.title) return fromBottleneck.title;
  for (const option of c.options) {
    const row = (option.courses ?? []).find((r) => normalizeCode(r.code) === normalized);
    if (row?.title) return row.title;
  }
  return "";
}

/** "CS 262 Introduction to Low-Level Programming", or just the code when the
 *  title is not in the data. Never a title we do not hold. */
function named(c: ChatContext, code: string): string {
  const title = titleFor(c, code);
  return title ? `${normalizeCode(code)} ${title}` : normalizeCode(code);
}

/** Which options a course appears on, with its section. */
function placements(c: ChatContext, code: string) {
  const normalized = normalizeCode(code);
  const hits: { letter: string; option: ScheduleOption; row: ScheduleOption["courses"][number] }[] =
    [];
  c.options.forEach((option, i) => {
    const row = (option.courses ?? []).find((r) => normalizeCode(r.code) === normalized);
    if (row) hits.push({ letter: LETTERS[i] ?? String(i + 1), option, row });
  });
  return hits;
}

function skillNamesFor(c: ChatContext, skillIds: string[]): string[] {
  return (skillIds ?? []).map(
    (id) => c.gaps.find((g) => g.skillId === id)?.skillName ?? id,
  );
}

/** "Option A" / "Options A and B". The letters match the schedule cards. */
function optionList(letters: string[]): string {
  return `${letters.length === 1 ? "Option" : "Options"} ${listSentence(letters)}`;
}

function listSentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const ADVISOR = "Confirm it with your advisor before you register.";

/**
 * A true, specific answer written with no model involved.
 *
 * Used in three places: the API route when there is no key or the call fails,
 * the client when the request itself fails, and as the reference for what the
 * model is allowed to say. It answers the three suggested chips properly and
 * degrades to an honest "I don't have that" for everything else, which is the
 * same instruction the system prompt gives the model.
 */
export function answerFromContext(context: ChatContext, question: string): string {
  const c = normalizeContext(context);
  const q = String(question ?? "").toLowerCase().trim();

  if (!hasGrounding(c)) {
    return "I do not have your audit or your schedule options yet, so there is nothing for me to read. Upload your degree audit first, then ask me again.";
  }
  if (q.length === 0) {
    return "Ask me about a course by its code, about one of the options, or about a skill your postings asked for.";
  }

  const codes = extractCourseCodes(q, knownCodes(c));
  const wantsSkip =
    /\b(skip|skipping|drop|dropping|not take|don'?t take|dont take|delay|postpone|put off|push back|next year|wait)\b/.test(q);
  const wantsGive =
    /\b(give|gives|teach|teaches|cover|covers|worth|useful|point of|get out of)\b/.test(q);
  const wantsCredits = /\b(credit|credits|hours|load|heavy|lighter|light)\b/.test(q);
  const wantsWhen =
    /\b(crn|when|times?|meets?|meeting|days?|schedule|register|registration|section)\b/.test(q);
  const wantsDifference =
    /\b(difference|differ|different|compare|versus|vs|which option|instead)\b/.test(q);

  // -- a specific course ---------------------------------------------------
  const code = codes[0];
  if (code) {
    const bottleneck = c.bottlenecks.find((b) => normalizeCode(b.code) === code);
    const where = placements(c, code);
    const takenAlready = (c.audit?.coursesTaken ?? [])
      .map(normalizeCode)
      .includes(code);

    const onOptions =
      where.length === 0
        ? ""
        : where.length === c.options.length && c.options.length > 1
          ? ` It is on every option, as CRN ${where[0]!.row.section?.crn ?? "not listed"}.`
          : ` It is on ${optionList(where.map((w) => w.letter))}, as CRN ${where[0]!.row.section?.crn ?? "not listed"}, ${formatMeeting(where[0]!.row.section)}.`;

    if (takenAlready && !bottleneck && where.length === 0) {
      return `Your audit lists ${named(c, code)} as already completed, so it is not on any of your ${NEXT_TERM_LABEL} options. If that is wrong, your official audit is the document that governs. ${ADVISOR}`;
    }

    // Asked about the meeting time or the CRN specifically. Checked before the
    // urgency branch, or "when does CS 330 meet" gets answered with a lecture
    // about why it is urgent and never says the time.
    if (wantsWhen && !wantsSkip && where.length > 0) {
      const row = where[0]!.row;
      // Banner prints "TBA" where the instructor is not yet assigned. "Taught by
      // TBA" is not a fact about a person, so it is not said.
      const instructor = row.section?.instructor?.trim();
      const named2 =
        instructor && instructor.toUpperCase() !== "TBA"
          ? `, taught by ${instructor}`
          : "";
      return `${named(c, code)} is CRN ${row.section?.crn ?? "not listed"} on ${optionList(where.map((w) => w.letter))}, ${formatMeeting(row.section)}${named2}. That CRN is from the public ${NEXT_TERM_LABEL} schedule of classes. ${ADVISOR}`;
    }

    if (bottleneck) {
      const dependents = bottleneck.dependents ?? [];
      const behind =
        dependents.length > 0
          ? `${plural(dependents.length, "course")} you still need ${dependents.length === 1 ? "sits" : "sit"} behind it: ${listSentence(dependents.map(normalizeCode))}.`
          : "Nothing else you still need sits behind it in the prerequisite graph.";

      if (wantsSkip) {
        const consequence =
          dependents.length > 0
            ? `everything behind it moves with it, and that is ${listSentence(dependents.map(normalizeCode))}`
            : "the rest of your sequence is not waiting on it, so the cost is smaller";
        return `If you leave ${named(c, code)} until later, ${consequence}. Your audit puts its urgency at "${bottleneck.urgency}" because ${bottleneck.reason}. I cannot tell you what that does to your graduation date. ${ADVISOR}`;
      }

      const plannable = (bottleneck.termsOffered ?? []).filter((t) => t !== "summer");
      const offering =
        plannable.length === 1
          ? ` It is only offered in the ${plannable[0]} term, which is part of why it is ranked this way.`
          : "";
      return `${named(c, code)} is ranked "${bottleneck.urgency}" because ${bottleneck.reason}. ${behind}${offering}${onOptions} ${ADVISOR}`;
    }

    if (where.length > 0) {
      const row = where[0]!.row;
      const closes = skillNamesFor(c, row.skillsClosed ?? []);
      // Sentence-final and quoted: a DWA name carries its own full stop, and
      // §9.3 does not allow editing one to fit a sentence.
      const skillLine =
        closes.length > 0
          ? `It closes ${plural(closes.length, "skill")} your postings asked for that nothing left in your requirements covers: ${listSentence(closes.map(quoteSkill))}`
          : "It does not close any of the open skills your postings asked for; it is on this option for its credits and because it fits the rest of the week.";
      return `${named(c, code)} is on ${optionList(where.map((w) => w.letter))} as CRN ${row.section?.crn ?? "not listed"}, ${formatMeeting(row.section)}. It is not holding up any other course you still need. ${skillLine} ${ADVISOR}`;
    }

    const stillRequired = (c.audit?.requirements ?? []).some((r) =>
      (r.missing ?? []).map(normalizeCode).includes(code),
    );
    if (stillRequired) {
      return `${named(c, code)} is still required for your degree, but nothing else you still need is waiting on it, so it is not ranked as a blocker and it is not on a ${NEXT_TERM_LABEL} option here. ${ADVISOR}`;
    }

    return `I do not have anything about ${normalizeCode(code)} in your audit or your ${NEXT_TERM_LABEL} options, so I cannot tell you about it. Look it up in the University Catalog and ask your advisor whether it counts for you.`;
  }

  // -- a course code we do not hold ---------------------------------------
  const anyCodeShaped = /\b[A-Za-z]{2,4}\s*[- ]?\s*\d{3}\b/.exec(q);
  if (anyCodeShaped) {
    return `${anyCodeShaped[0].toUpperCase().replace(/\s+/g, " ")} is not in your audit, your blocked courses, or your ${NEXT_TERM_LABEL} options, so I have nothing on it and I am not going to guess. Check the University Catalog listing for it and ask your advisor whether it would count toward your requirements.`;
  }

  // -- no course named: answer from the shape of the plan ------------------
  if (wantsDifference && c.options.length > 1) {
    const base = c.options[0]!;
    const baseCodes = (base.courses ?? []).map((r) => normalizeCode(r.code));
    const lines = c.options.slice(1).map((option, i) => {
      const letter = LETTERS[i + 1] ?? String(i + 2);
      const codes2 = (option.courses ?? []).map((r) => normalizeCode(r.code));
      const added = codes2.filter((x) => !baseCodes.includes(x));
      const dropped = baseCodes.filter((x) => !codes2.includes(x));
      const parts = [
        added.length > 0 ? `adds ${listSentence(added)}` : "",
        dropped.length > 0 ? `drops ${listSentence(dropped)}` : "",
      ].filter(Boolean);
      return `Option ${letter} ${parts.length > 0 ? parts.join(" and ") : "carries the same courses"} at ${option.totalCredits} credits`;
    });
    return `The required courses are on every option, so the elective slot is the only real difference. Against Option A at ${base.totalCredits} credits, ${listSentence(lines)}. ${ADVISOR}`;
  }

  if (wantsCredits && c.options.length > 0) {
    const parts = c.options.map(
      (o, i) => `Option ${LETTERS[i] ?? i + 1} is ${o.totalCredits} credits`,
    );
    return `${listSentence(parts)}. Each one clears the courses your audit flags as blocking and spends your open elective slot differently. ${ADVISOR}`;
  }

  if (wantsWhen && c.options.length > 0) {
    const first = c.options[0]!;
    const rows = (first.courses ?? [])
      .slice(0, 3)
      .map((r) => `${normalizeCode(r.code)} is CRN ${r.section?.crn ?? "not listed"}, ${formatMeeting(r.section)}`);
    return `On Option A, ${listSentence(rows)}. Those CRNs come straight from the public ${NEXT_TERM_LABEL} schedule of classes. ${ADVISOR}`;
  }

  const open = c.gaps.filter((g) => !g.covered);
  if ((wantsGive || /\b(skill|skills|job|jobs|posting|postings|employer|career)\b/.test(q)) && c.gaps.length > 0) {
    const reachable = open.filter((g) => (g.closableBy ?? []).length > 0);
    const coveredCount = c.gaps.length - open.length;
    const already = `${plural(coveredCount, "skill")} ${coveredCount === 1 ? "is" : "are"} already covered by courses you have taken or still have to take`;
    if (reachable.length > 0) {
      // The DWA name goes last, carrying its own period. See quoteSkill.
      return `Your postings asked for ${plural(c.gaps.length, "skill")} in total. ${already[0]!.toUpperCase()}${already.slice(1)}, and ${plural(reachable.length, "skill")} ${reachable.length === 1 ? "is" : "are"} still open with a course you could take next term. The most-asked-for of those is ${quoteSkill(reachable[0]!.skillName)}`;
    }
    return `Your postings asked for ${plural(c.gaps.length, "skill")} in total, and ${already}. The rest have no course you could take next term, usually because of a prerequisite you have not finished. ${ADVISOR}`;
  }

  const top = c.bottlenecks.find((b) => b.urgency !== "flexible") ?? c.bottlenecks[0];
  if (top) {
    const openLine =
      c.gaps.length > 0
        ? ` ${open.length} of the ${plural(c.gaps.length, "skill")} your postings asked for ${open.length === 1 ? "is" : "are"} still open.`
        : "";
    return `The course driving your plan is ${named(c, top.code)}: ${top.reason}, and it is ranked "${top.urgency}".${openLine} Ask me about any course by its code and I will tell you what I have on it.`;
  }

  return `I have your audit and ${c.options.length} ${NEXT_TERM_LABEL} option${c.options.length === 1 ? "" : "s"} in front of me, but nothing in your remaining requirements is ranked as blocking another course. Ask me about a specific course by its code, or about what an option costs you.`;
}
