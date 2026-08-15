import { Check, ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";

import { WeekGrid, weekBounds, type WeekBlock } from "@/components/WeekGrid";
import { Button } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";
import type { ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One of the three options — CLAUDE.md §13, State 4.
 *
 * REBUILT Aug 15. The card used to carry, per option: a name, a subtitle, a
 * unified-diff line, a week, five or six course rows each holding a CRN, an
 * instructor link, a meeting time and a skill sentence, a six-line statistics
 * block, a WHY paragraph and a TRADEOFF paragraph. Everything shared by all
 * three options was printed three times, so finding the one course that
 * actually differed meant reading all three columns end to end.
 *
 * The card now carries only what is needed to CHOOSE, in a fixed order:
 *
 *   1. the option name (deterministic, from STRATEGY_LABEL — not the model)
 *   2. the week, the largest element on the card
 *   3. one line naming the courses only this option has
 *   4. three numbers: credits, days on campus, job skills
 *   5. ONE disclosure holding the full list, the CRNs and the catch
 *   6. one button
 *
 * Everything needed to REGISTER — instructors, professor links, the O*NET skill
 * sentences, the per-course "Why this?" — moved to Cart.tsx, which the student
 * only reaches after choosing. Reference data is not decision data.
 *
 * Four things here are still not cosmetic:
 *
 *  1. "You've done the prerequisites we can see. We can't see grades."
 *     PrereqRule.minGrade is extracted but unconsumable — StudentAudit
 *     .coursesTaken carries no grades — so the stronger claim is false for a
 *     student with a D. §8, §13. It is now stated ONCE, in ScheduleOptions'
 *     shared strip, rather than once per card.
 *  2. The honest denominator survives as a numeral: the job-skills tile reads
 *     "2 of 3", never "2". §11.2 — a gap whose only closers are prereq-blocked
 *     cannot be closed next term by any schedule.
 *  3. Every course row carries exactly one role tag once `requiredCodes` is
 *     passed, in screen 3's vocabulary ("Take this term"). Without it, seeing
 *     a course screen 3 called safe-to-delay reads as a contradiction.
 *  4. The grid is aria-hidden by design (see WeekGrid), and the card no longer
 *     prints meeting times in visible text. The sr-only block below the grid is
 *     therefore the ONLY text equivalent for the week. Deleting it is a WCAG
 *     1.1.1 regression, not a copy edit.
 */

const STRATEGY_LABEL: Record<ScheduleOption["strategy"], string> = {
  // What §11.3 step 6 actually maximises, said in the student's words. This is
  // the card's title now: deterministic, three to five words, and it takes the
  // model out of the biggest heading on the busiest screen.
  "max-coverage": "Closes the most job skills",
  balanced: "A lighter term",
  "keeps-options-open": "Spreads across your postings",
};

type CourseRow = ScheduleOption["courses"][number];

/** "13:30" → "1:30 pm". Empty string means asynchronous, handled by the caller. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || m === undefined) return hhmm;
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

/** Banner's own day letters. R is Thursday, which no student reads as Thursday. */
const DAY_WORDS: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};

/** "TR" → "Tue, Thu". Unknown letters pass through rather than vanishing. */
export function formatDays(days: string): string {
  const words = [...days].map((letter) => DAY_WORDS[letter] ?? letter);
  return words.length > 0 ? words.join(", ") : days;
}

/**
 * Banner writes Time="TBA" and Days="&nbsp;" for asynchronous sections, and
 * §9.1 normalises those to empty strings at parse time. Rendering has to honour
 * that or the 12h converter emits "NaN:NaN" on a schedule card.
 *
 * Plain hyphen in the time range, never an en-dash, and the day letters are
 * spelled out. Both are stack rules; "TR" was also the single most opaque token
 * on the screen for a student who has never registered before.
 */
export function formatMeeting(section: Section): string {
  if (section.days === "" || section.startTime === "") {
    return "No set meeting time";
  }
  return `${formatDays(section.days)} · ${formatTime(section.startTime)}-${formatTime(section.endTime)}`;
}

/**
 * The live public section detail page on Banner 8. Same trailing-slash gotcha
 * §9.1 documents for `p_disp_dyn_sched`: without the slash after the procedure
 * name Banner returns a 404.
 *
 * No login, no session, no cookie — the page a student would reach by hand, and
 * it carries the registration availability counts. That makes every CRN in this
 * product checkable against the university's own system in one click, which is
 * the cheapest verification of §10's "everything public is real" claim.
 */
export function bannerSectionUrl(crn: string): string {
  return `https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_detail_sched/?term_in=${NEXT_TERM_BANNER_CODE}&crn_in=${crn}`;
}

/**
 * EVERY section of one course on Banner 8 — the escape hatch for the cart's
 * section picker, which caps how many it lists.
 *
 * Same trailing-slash rule as above; without it this procedure 404s too.
 * ✅ Verified live against `bwckctlg.p_disp_listcrse/` for CS 405: HTTP 200 and
 * exactly the 11 CRNs `data/courses.json` carries for it.
 *
 * A code that is not "DEPT NNN" yields no URL rather than a broken link.
 */
export function bannerCourseUrl(code: string): string | null {
  const m = /^([A-Z]{2,4}) (\d{3})$/.exec(normalizeCode(code));
  if (!m) return null;
  return `https://patriotweb.gmu.edu/pls/prod/bwckctlg.p_disp_listcrse/?term_in=${NEXT_TERM_BANNER_CODE}&subj_in=${m[1]}&crse_in=${m[2]}&schd_in=`;
}

/**
 * Which of the three things a row can be. "unknown" is the honest state before
 * `requiredCodes` is threaded: labelling a required course "elective" would be
 * a false claim about the student's degree (§0 rule 7), so we print no tag at
 * all rather than guess.
 */
export type RowRole = "waiting" | "required" | "elective" | "unknown";

export function rowRole(course: CourseRow, requiredCodes?: Set<string>): RowRole {
  if (course.isBottleneck) return "waiting";
  if (!requiredCodes || requiredCodes.size === 0) return "unknown";
  return requiredCodes.has(normalizeCode(course.code))
    ? "required"
    : "elective";
}

export const ROLE_TAG: Record<
  Exclude<RowRole, "unknown">,
  { label: string; className: string; icon: boolean }
> = {
  waiting: {
    label: "Take this term",
    className: "bg-critical-soft text-critical",
    icon: true,
  },
  required: {
    label: "Required",
    className: "bg-muted text-muted-foreground",
    icon: false,
  },
  elective: {
    label: "Elective",
    className: "bg-brand-soft text-brand",
    icon: false,
  },
};

/**
 * Grid block colour when we do NOT know what the options share — the cart, and
 * any single-option render. It follows the row tag exactly, so the week and the
 * list cannot tell the student two different things about the same course.
 */
const ROLE_TONE: Record<RowRole, WeekBlock["tone"]> = {
  waiting: "critical",
  required: "required",
  elective: "elective",
  unknown: "required",
};

/**
 * Every course on the card as a placeable (or async, hence skipped) block.
 *
 * `sharedCodes` changes what the colour MEANS, and that is the whole argument
 * for putting three grids on one screen. When the caller knows which courses sit
 * on every option, the spine goes neutral and only the courses unique to this
 * option take the accent — so three grids read as three different semesters in
 * about a second instead of three near-identical rectangles.
 *
 * The "*" prefix is not decoration: it is the non-colour cue for WCAG 1.4.1, and
 * it is a plain ASCII asterisk rather than a star glyph because the block label
 * renders in a mono face that may not carry U+2605. The same information is also
 * in words directly under the grid ("Only here: CS 484, MATH 464"), so a reader
 * who sees neither colour nor glyph still gets it.
 */
export function weekBlocksFor(
  option: ScheduleOption,
  requiredCodes?: Set<string>,
  sharedCodes?: Set<string>,
): WeekBlock[] {
  return option.courses.map((course) => {
    const role = rowRole(course, requiredCodes);
    const unique = sharedCodes !== undefined && !sharedCodes.has(course.code);
    // "Take this term" always keeps the critical tone, even in sameness mode.
    // A course whose row tag is red and whose block is blue is the grid and the
    // list telling the student two different things, which is the one thing
    // WeekGrid's own header says must never happen. The "*" carries the
    // uniqueness of an urgent course instead.
    const tone: WeekBlock["tone"] =
      role === "waiting"
        ? "critical"
        : sharedCodes
          ? unique
            ? "elective"
            : "required"
          : ROLE_TONE[role];
    return {
      code: unique ? `* ${course.code}` : course.code,
      days: course.section.days,
      startTime: course.section.startTime,
      endTime: course.section.endTime,
      tone,
      label: course.section.startTime
        ? formatTime(course.section.startTime)
        : undefined,
    };
  });
}

/** "13:30" → 810. Null for "" (asynchronous) or anything malformed. */
function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * How many distinct days this schedule puts you on campus. Every study of how
 * students actually pick courses has this in the top three criteria, and the
 * product did not compute it anywhere until now. Asynchronous sections carry no
 * days and correctly count for nothing.
 */
export function daysOnCampus(option: ScheduleOption): number {
  const days = new Set<string>();
  for (const course of option.courses) {
    for (const letter of course.section.days) days.add(letter);
  }
  return days.size;
}

/** "9:00 am", or null when every section is asynchronous. Compared in minutes. */
export function earliestStart(option: ScheduleOption): string | null {
  let best = Infinity;
  let label: string | null = null;
  for (const course of option.courses) {
    const mins = minutesOf(course.section.startTime);
    if (mins === null || mins >= best) continue;
    best = mins;
    label = formatTime(course.section.startTime);
  }
  return label;
}

export interface ScheduleCardProps {
  option: ScheduleOption;
  /** "A", "B", "C" — position in the row, not part of the contract. */
  letter: string;
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /**
   * Open gaps a course offered next term could actually close. The denominator
   * the student is measured against has to be one a schedule can reach, or
   * "closes 1 of 7" reads as a failing grade against an impossible target.
   */
  reachableGaps?: number;
  /** Still-needed required course codes, normalised. Drives the REQUIRED tag. */
  requiredCodes?: Set<string>;
  /**
   * Course codes that appear on EVERY option. Colours the week by sameness and
   * decides which courses this card names as its own. Omit it (the cart does)
   * and the grid falls back to colouring by role.
   */
  sharedCodes?: Set<string>;
  /**
   * One to three words, computed from numbers already on the card, e.g.
   * "Lightest". Replaces the TRADEOFF paragraph in the header.
   */
  tag?: string;
  /**
   * Still-required courses this option leaves out that another option takes.
   * The single most consequential difference between two cards, and it used to
   * be visible only inside the diff string.
   */
  deferredRequired?: string[];
  /**
   * The vertical scale for the week grid, computed ONCE across every option by
   * ScheduleOptions. Three cards on one screen must share it or the grids invite
   * a comparison they get wrong — see the note in WeekGrid. Omit it and the grid
   * simply does not render.
   */
  week?: { startHour: number; endHour: number };
  selected?: boolean;
  onSelect: () => void;

  /* ---- accepted, no longer rendered on the card; kept so a caller that still
     passes them keeps compiling. All of this now lives in Cart.tsx. ---- */
  /** @deprecated Moved to Cart.tsx. */
  skillNames?: Record<string, string>;
  /** @deprecated Moved to ScheduleOptions' shared strip. */
  blockedGaps?: number;
  /** @deprecated Moved to Cart.tsx. */
  dependentsOf?: Record<string, string[]>;
  /** @deprecated Moved to Cart.tsx. */
  skillDemand?: Record<string, number>;
  /** @deprecated Moved to Cart.tsx. */
  postingCount?: number;
  /** @deprecated The unified-diff line is gone. See ScheduleOptions. */
  diff?: string;
}

export function ScheduleCard({
  option,
  letter,
  slotsAvailable,
  reachableGaps,
  requiredCodes,
  sharedCodes,
  tag,
  deferredRequired = [],
  week,
  selected = false,
  onSelect,
}: ScheduleCardProps) {
  const blocks = weekBlocksFor(option, requiredCodes, sharedCodes);
  // `week` is the scale shared across ALL options, so it is defined even for a
  // card whose own courses are every one of them asynchronous — and WeekGrid
  // then renders nothing, leaving an empty bordered box. weekBounds returns null
  // for exactly that set, so it is the honest test of "is there a week to draw".
  const hasWeek = week !== undefined && weekBounds(blocks) !== null;
  const asyncCodes = option.courses
    .filter((c) => c.section.days === "" || c.section.startTime === "")
    .map((c) => c.code);

  const unique = sharedCodes
    ? option.courses.map((c) => c.code).filter((code) => !sharedCodes.has(code))
    : [];
  const days = daysOnCampus(option);
  const skillTotal = reachableGaps ?? option.gapsTotal;
  const title = STRATEGY_LABEL[option.strategy];

  return (
    <article
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-card transition-shadow",
        selected
          ? "ring-2 ring-brand shadow-md"
          : "ring-1 ring-foreground/10 hover:shadow-sm",
      )}
    >
      <div className="flex flex-1 flex-col gap-3.5 px-4 py-4 sm:px-5">
        {/* 1 — the name. Fixed height below md so that switching the phone
            tabs moves the coloured blocks and nothing else. */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow text-muted-foreground">Option {letter}</p>
            {selected ? (
              <span className="eyebrow inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-brand">
                <Check className="size-3" aria-hidden />
                In cart
              </span>
            ) : tag ? (
              <span className="eyebrow rounded-full bg-muted px-2 py-1 text-muted-foreground">
                {tag}
              </span>
            ) : null}
          </div>
          {/* min-h is two lines of this exact type. "A lighter term" wraps to
              one and "Closes the most job skills" to two, and without the floor
              the phone tabs would shift the grid up and down as you switch. */}
          <h3 className="mt-2 min-h-[3.125rem] text-lg leading-snug font-semibold tracking-tight text-balance md:min-h-0">
            {title}
          </h3>
        </div>

        {/* 2 — the week. The one element on this screen that needs no reading,
            so it gets the area. min-h holds it steady across the phone tabs. */}
        {hasWeek && week && (
          <div className="flex min-h-[120px] flex-col justify-center md:min-h-[140px]">
            <WeekGrid
              blocks={blocks}
              startHour={week.startHour}
              endHour={week.endHour}
            />
          </div>
        )}

        {/* The grid is aria-hidden (see WeekGrid) and the card prints no meeting
            times in visible text any more, so this is the ONLY text equivalent
            for the week. WCAG 1.1.1. */}
        <p className="sr-only">
          {`Option ${letter}. ${title}. ${option.totalCredits} credits, ${days} ${days === 1 ? "day" : "days"} on campus. `}
          {option.courses
            .map((c) => `${c.code} ${c.title}, ${formatMeeting(c.section)}.`)
            .join(" ")}
          {option.conflicts.length === 0
            ? " No time conflicts."
            : ` ${option.conflicts.join("; ")}`}
        </p>

        {/* §8 says conflicts is [] by construction, so this branch is normally
            unreachable. It stays: if the builder ever emits one, the student has
            to see it. The affirmative "no conflicts" line is gone — the grid
            shows that, and the sr-only text above says it. */}
        {option.conflicts.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-critical">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {option.conflicts.join("; ")}
          </p>
        )}

        {asyncCodes.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-mono">{asyncCodes.join(", ")}</span>
            {": no set meeting time"}
          </p>
        )}

        {/* 3 — the one difference, in words. No plus signs, no minus signs, no
            "vs Option A". A student has never read a unified diff. */}
        <div className="space-y-2">
          {unique.length > 0 ? (
            <p className="text-sm leading-snug">
              <span className="text-muted-foreground">Only here: </span>
              <span className="font-mono font-medium">{unique.join(", ")}</span>
            </p>
          ) : sharedCodes && sharedCodes.size > 0 ? (
            <p className="text-sm leading-snug text-muted-foreground">
              Same classes, different times.
            </p>
          ) : null}

          {deferredRequired.length > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-soon-soft px-2.5 py-1 text-xs font-medium text-soon">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              Pushes {listCodes(deferredRequired)} later
            </p>
          )}
        </div>

        {/* 4 — three numbers. No number on this card sits inside a sentence. */}
        <dl className="grid grid-cols-3 gap-2 border-y border-rule py-3">
          <Stat value={String(option.totalCredits)} label="credits" />
          <Stat value={String(days)} label="days on campus" />
          <Stat
            value={
              skillTotal > 0 ? `${option.gapsClosed} of ${skillTotal}` : "0"
            }
            label="job skills"
          />
        </dl>

        {/* 5 — ONE disclosure. There used to be five or six of these per card,
            i.e. sixteen collapsed panels on one screen, which is sixteen
            decisions about whether to read something rather than one. */}
        <details className="group/all">
          <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
            See all {option.courses.length} classes
            <ChevronDown
              className="size-3.5 transition-transform group-open/all:rotate-180"
              aria-hidden
            />
          </summary>

          <div className="mt-2 overflow-hidden rounded-lg bg-canvas ring-1 ring-foreground/[0.07]">
            <ul className="divide-y divide-rule">
              {option.courses.map((course) => {
                const role = rowRole(course, requiredCodes);
                const rowTag = role === "unknown" ? null : ROLE_TAG[role];
                return (
                  <li key={course.section.crn} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-semibold">
                            {course.code}
                          </span>
                          {rowTag && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase",
                                rowTag.className,
                              )}
                            >
                              {rowTag.icon && (
                                <TriangleAlert
                                  className="size-2.5"
                                  aria-hidden
                                />
                              )}
                              {rowTag.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {course.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {formatMeeting(course.section)}
                        </p>
                      </div>
                      {/* py-1 for the WCAG 2.2 SC 2.5.8 24px target floor. One
                          click checks the section against the university's own
                          system, which is the product's whole claim. */}
                      <a
                        href={bannerSectionUrl(course.section.crn)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`CRN ${course.section.crn}, the ${NEXT_TERM_LABEL} section of ${course.code}, on the public schedule of classes`}
                        title="Course reference number. Opens this section on the public schedule of classes."
                        className="inline-flex shrink-0 items-center gap-1 py-1 font-mono text-[0.6875rem] text-muted-foreground tabular-nums underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
                      >
                        {course.section.crn}
                        <ExternalLink className="size-2.5" aria-hidden />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-1.5 border-t border-rule px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                Uses {option.slotsUsed} of your {slotsAvailable} electives.
              </p>
              {option.tradeoff && (
                <p>
                  <span className="font-semibold text-foreground">
                    The catch.{" "}
                  </span>
                  {option.tradeoff}
                </p>
              )}
            </div>
          </div>
        </details>

        {/* 6 — the button. Three of these is correct on this screen: the three
            cards ARE the choice. */}
        <Button
          onClick={onSelect}
          variant={selected ? "outline" : "default"}
          size="lg"
          className="mt-auto h-11 w-full"
        >
          {selected ? "Selected" : "Choose this"}
        </Button>
      </div>
    </article>
  );
}

/** A numeral over a label. Never a number inside a sentence. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    // flex-col-reverse so the numeral reads above the label while the markup
    // keeps the <dt> before <dd> that a definition list requires.
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-[0.6875rem] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xl leading-none font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** "CS 450 and CS 483", or "CS 450, CS 483 and 2 more". Chip copy, so it stays short. */
function listCodes(codes: string[]): string {
  if (codes.length <= 2) return codes.join(" and ");
  return `${codes.slice(0, 2).join(", ")} and ${codes.length - 2} more`;
}
