import { Check, ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";
import type { ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * State 4 primitives, CLAUDE.md §13.
 *
 * This file used to be "one of three tall cards". It is now two things:
 *
 *  1. The shared vocabulary of screen 4 (course tag, CRN link, section facts,
 *     the readout, the "Why this?" disclosure, the prose block), each of which
 *     renders on PAPER or on INK. ScheduleOptions composes them into an aligned
 *     comparison on desktop, where the same course sits on the same row across
 *     all three columns and the difference is visible without reading.
 *  2. `ScheduleCard` itself, which is now the STACKED presentation of one
 *     option. Three columns cannot survive 390px, so below `lg` the comparison
 *     collapses to one option per card, and the courses every option shares are
 *     lifted out and stated once above rather than repeated three times.
 *
 * Five things here are not cosmetic:
 *
 *  1. "You've taken the listed prerequisites", never "all prereqs met".
 *     PrereqRule.minGrade is extracted but unconsumable, because
 *     StudentAudit.coursesTaken carries no grades, so the stronger claim is
 *     false for a student with a D. §8, §13. "(we can't see grades)" says why.
 *  2. The professor link is a constructed RateMyProfessors search URL that the
 *     student's own browser follows. §5 and §11.4: we never fetch it, and we
 *     never assert a rating. The wording is "look them up", not "rated 4.2".
 *  3. Every course carries exactly one role tag once `requiredCodes` is passed.
 *     Screen 3 tells the student CS 321 and CS 405 can wait; without a tag,
 *     seeing both here reads as the product contradicting itself. The
 *     vocabulary is screen 3's: "Take this term".
 *  4. The "Why this?" disclosure calls no model and makes no network request.
 *     It is the same computation that put the course on the card, printed. A
 *     model that gets a prerequisite wrong in front of a registrar is the worst
 *     failure available to this project, so nothing here is generated: if the
 *     OpenAI call that writes `why`/`tradeoff` degrades, this is unaffected.
 *  5. Every institutional number is set in `.data`: CRNs, course codes, credit
 *     hours, meeting times, the term code. The CRN is the thing a student
 *     copies by hand, so it is the loudest element in any cell it appears in.
 */

export const STRATEGY_LABEL: Record<ScheduleOption["strategy"], string> = {
  // What §11.3 step 6 actually maximises, said in the student's words.
  "max-coverage": "Closes the most skill gaps",
  balanced: "A lighter term",
  "keeps-options-open": "Spreads across your postings",
};

export type CourseRow = ScheduleOption["courses"][number];

/** Paper is the input surface; ink is the analysis surface. See globals.css. */
export type Tone = "paper" | "ink";

/** "13:30" to "1:30 pm". Empty string means asynchronous, handled by callers. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || m === undefined) return hhmm;
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

/**
 * Banner writes Time="TBA" and Days="&nbsp;" for asynchronous sections, and
 * §9.1 normalises those to empty strings at parse time. Rendering has to honour
 * that or the 12h converter emits "NaN:NaN" on a schedule card.
 */
export function formatMeeting(section: Section): string {
  if (section.days === "" || section.startTime === "") {
    return "Asynchronous, no set meeting time";
  }
  return `${section.days} · ${formatTime(section.startTime)}–${formatTime(section.endTime)}`;
}

/**
 * The live public section detail page on Banner 8. Same trailing-slash gotcha
 * §9.1 documents for `p_disp_dyn_sched`: without the slash after the procedure
 * name Banner returns a 404.
 *
 * No login, no session, no cookie. It is the page a student would reach by
 * hand, and it carries the registration availability counts. That makes every
 * CRN on this screen checkable against the university's own system in one
 * click, which is the cheapest verification of §10's "everything public is
 * real" claim.
 */
export function bannerSectionUrl(crn: string): string {
  return `https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_detail_sched/?term_in=${NEXT_TERM_BANNER_CODE}&crn_in=${crn}`;
}

/**
 * Which of the three things a course can be. "unknown" is the honest state
 * before `requiredCodes` is threaded: labelling a required course "elective"
 * would be a false claim about the student's degree (§0 rule 7), so we print no
 * tag at all rather than guess.
 */
export type RowRole = "waiting" | "required" | "elective" | "unknown";

export function rowRole(course: CourseRow, requiredCodes?: Set<string>): RowRole {
  if (course.isBottleneck) return "waiting";
  if (!requiredCodes || requiredCodes.size === 0) return "unknown";
  return requiredCodes.has(normalizeCode(course.code)) ? "required" : "elective";
}

/**
 * Colour carries meaning and nothing else. On ink the soft variants become the
 * TEXT colour, because the solid ones are mixed for a paper background and go
 * muddy on a dark surface.
 */
const ROLE_TAG: Record<
  Exclude<RowRole, "unknown">,
  { label: string; paper: string; ink: string; icon: boolean }
> = {
  waiting: {
    label: "Take this term",
    paper: "bg-critical-soft text-critical",
    ink: "bg-critical-soft/12 text-critical-soft ring-1 ring-critical-soft/30",
    icon: true,
  },
  required: {
    label: "Required",
    paper: "bg-muted text-muted-foreground",
    ink: "bg-ink-fg/10 text-ink-muted ring-1 ring-ink-rule",
    icon: false,
  },
  elective: {
    label: "Elective",
    paper: "bg-brand-soft text-brand",
    ink: "bg-brand-soft/12 text-brand-soft ring-1 ring-brand-soft/30",
    icon: false,
  },
};

export function CourseTag({
  role,
  tone = "paper",
}: {
  role: RowRole;
  tone?: Tone;
}) {
  if (role === "unknown") return null;
  const tag = ROLE_TAG[role];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.08em] uppercase",
        tone === "ink" ? tag.ink : tag.paper,
      )}
    >
      {tag.icon && <TriangleAlert className="size-2.5" aria-hidden />}
      {tag.label}
    </span>
  );
}

/**
 * The CRN, which is the whole product claim (§4) and the one string a student
 * retypes by hand. Mono, tabular, foreground weight, dotted underline: it has
 * to look copyable, not like a footnote reference.
 *
 * py-1 keeps it over the 24px WCAG 2.2 SC 2.5.8 target floor at the small size.
 */
export function CrnLink({
  crn,
  code,
  tone = "paper",
  size = "md",
}: {
  crn: string;
  code: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <a
      href={bannerSectionUrl(crn)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`CRN ${crn}, the ${NEXT_TERM_LABEL} section of ${code}, on the public schedule of classes`}
      title="Course reference number. Opens this section on the public schedule of classes."
      className={cn(
        "data inline-flex items-center gap-1.5 py-1 font-semibold underline decoration-dotted underline-offset-4 transition-colors",
        size === "lg" && "text-xl",
        size === "md" && "text-[0.9375rem]",
        size === "sm" && "text-xs",
        tone === "ink"
          ? "text-ink-fg hover:text-brand-soft"
          : "text-foreground hover:text-brand",
      )}
    >
      {crn}
      <ExternalLink
        className={cn(size === "sm" ? "size-2.5" : "size-3")}
        aria-hidden
      />
    </a>
  );
}

/** Meeting pattern, modality and the professor lookup. All published facts. */
export function SectionFacts({
  course,
  tone = "paper",
}: {
  course: CourseRow;
  tone?: Tone;
}) {
  const muted = tone === "ink" ? "text-ink-muted" : "text-muted-foreground";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
        muted,
      )}
    >
      <span className="data">{formatMeeting(course.section)}</span>
      {course.section.modality !== "in-person" && (
        <span
          className={cn(
            "rounded px-1.5 py-0.5",
            tone === "ink" ? "bg-ink-fg/10" : "bg-muted",
          )}
        >
          {course.section.modality}
        </span>
      )}
      {course.section.instructor && (
        <a
          href={course.rmpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 py-1 underline decoration-dotted underline-offset-2 transition-colors",
            tone === "ink" ? "hover:text-brand-soft" : "hover:text-brand",
          )}
          title={`Look up ${course.section.instructor} on RateMyProfessors`}
        >
          {course.section.instructor}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </div>
  );
}

/** "Closes 2 gaps · Analyze data to identify trends" */
export function ClosesLine({
  course,
  skillNames,
  tone = "paper",
}: {
  course: CourseRow;
  skillNames?: Record<string, string>;
  tone?: Tone;
}) {
  const closes = course.skillsClosed.length;
  if (closes === 0) return null;
  const first = skillNames?.[course.skillsClosed[0]!];
  return (
    <p
      className={cn(
        "text-xs leading-snug",
        tone === "ink" ? "text-covered-soft" : "text-covered",
      )}
    >
      Closes <span className="data">{closes}</span>{" "}
      {closes === 1 ? "gap" : "gaps"}
      {first ? (
        <span className={tone === "ink" ? "text-ink-muted" : "text-muted-foreground"}>
          {" "}
          · {first}
          {closes > 1 ? ` +${closes - 1}` : ""}
        </span>
      ) : null}
    </p>
  );
}

/**
 * Line 1 of the disclosure: why this course is here at all. Every branch ends
 * in a written sentence, including the two degraded ones, so the panel can
 * never open empty.
 */
function roleSentence(
  course: CourseRow,
  role: RowRole,
  dependentsOf?: Record<string, string[]>,
): string {
  const dependents = dependentsOf?.[normalizeCode(course.code)] ?? [];

  if (role === "waiting") {
    if (dependents.length > 0) {
      const n = dependents.length;
      return `Required, and ${n} ${n === 1 ? "course" : "courses"} you still need ${n === 1 ? "is" : "are"} waiting on it: ${dependents.join(", ")}.`;
    }
    return "Required, and it is one of the courses others are waiting on, so the sooner it happens the more of your degree stays reachable.";
  }
  if (role === "required") {
    return "Required for your degree. Nothing else is waiting on it, so the order is yours, but it has to happen sometime.";
  }
  if (role === "elective") {
    return "This fills an elective slot. Your required courses are fixed; this is the part of next term you get to pick.";
  }
  return "Your prerequisites for it are done and its section fits around the rest of this option.";
}

/**
 * §5 rejected a chat box. The need it served, "why is this course here?", is
 * met here instead: template lines, no model, no fetch, no loading state, no
 * error state, and no state at all beyond the browser's own open/closed.
 * Native <details> is keyboard-operable and works on touch, which a hover
 * popover is not and does not.
 */
export function WhyThis({
  course,
  role,
  dependentsOf,
  skillNames,
  skillDemand,
  postingCount,
  tone = "paper",
  align = "start",
}: {
  course: CourseRow;
  role: RowRole;
  dependentsOf?: Record<string, string[]>;
  skillNames?: Record<string, string>;
  skillDemand?: Record<string, number>;
  postingCount?: number;
  tone?: Tone;
  align?: "start" | "end";
}) {
  const ink = tone === "ink";
  return (
    <details className="group/why">
      {/* py-1 lifts this from 16px to 24px tall. WCAG 2.2 SC 2.5.8 sets 24x24
          CSS px as the minimum target, and measured at 16px this was the
          smallest real control on the busiest screen. */}
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1 py-1 text-xs transition-colors [&::-webkit-details-marker]:hidden",
          align === "end" ? "justify-end" : "justify-start",
          ink
            ? "text-ink-muted hover:text-ink-fg focus-visible:text-ink-fg"
            : "text-muted-foreground hover:text-brand focus-visible:text-brand",
        )}
      >
        Why this?
        <ChevronDown
          className="size-3 transition-transform group-open/why:rotate-180"
          aria-hidden
        />
      </summary>

      <div
        className={cn(
          "mt-2 space-y-2 rounded-lg px-3 py-2.5 text-xs leading-relaxed",
          ink
            ? "bg-ink-2 text-ink-fg ring-1 ring-ink-rule"
            : "bg-canvas text-foreground ring-1 ring-foreground/[0.07]",
        )}
      >
        <p>{roleSentence(course, role, dependentsOf)}</p>

        {course.skillsClosed.length > 0 ? (
          <div className={ink ? "text-ink-muted" : "text-muted-foreground"}>
            <p>Teaches:</p>
            {/* O*NET DWA names are rendered verbatim. §9.3: keeping them
                unedited is what keeps the CC BY 4.0 "indicate changes" clause
                from firing, and the raw skillId is the fallback so a missing
                name can never render an empty line. */}
            <ul className="mt-0.5 space-y-0.5">
              {course.skillsClosed.map((id) => (
                <li key={id} className="flex gap-1.5">
                  <span aria-hidden>·</span>
                  <span>
                    {skillNames?.[id] ?? id}
                    {demandNote(skillDemand?.[id], postingCount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={ink ? "text-ink-muted" : "text-muted-foreground"}>
            {
              "Doesn't close any of your open skill gaps. It is here for the degree, not for the job."
            }
          </p>
        )}

        <p className={ink ? "text-ink-muted" : "text-muted-foreground"}>
          CRN <span className="data">{course.section.crn}</span> is the number
          you paste into registration. {formatMeeting(course.section)}
          {course.section.instructor
            ? ` with ${course.section.instructor}.`
            : ", instructor not listed yet."}
        </p>
      </div>
    </details>
  );
}

/** "· 2 of your 3 postings asked for this." Silent when we lack the counts. */
function demandNote(demand?: number, postingCount?: number): string {
  if (!demand || demand < 1) return "";
  if (postingCount && postingCount >= demand) {
    return ` · ${demand} of your ${postingCount} postings asked for this`;
  }
  return ` · ${demand} ${demand === 1 ? "posting" : "postings"} asked for this`;
}

/**
 * The honest denominator. `gapsTotal` counts every demanded skill, including
 * the ones no course the student can take next term closes, which measures a
 * schedule against a target it structurally cannot hit. When the caller passes
 * the reachable count we use it; when it does not we fall back to the older
 * wording rather than print a number we cannot stand behind.
 */
export function gapSentence(
  option: ScheduleOption,
  reachableGaps?: number,
): string {
  if (reachableGaps === undefined) {
    return `Closes ${option.gapsClosed} of ${option.gapsTotal} gaps`;
  }
  if (reachableGaps === 0) {
    return "None of your open skill gaps can be closed next term";
  }
  return `Closes ${option.gapsClosed} of the ${reachableGaps} skill gaps you can reach next term`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="data text-[1.75rem] leading-none font-semibold">{value}</p>
      <p className="eyebrow mt-2 text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Three numbers per option, on the same baseline across every option, so the
 * tradeoff is legible before a single sentence is read. The prose underneath
 * carries the honest framing that a bare fraction cannot.
 */
export function OptionReadout({
  option,
  slotsAvailable,
  reachableGaps,
  blockedGaps,
}: {
  option: ScheduleOption;
  slotsAvailable: number;
  reachableGaps?: number;
  blockedGaps?: number;
}) {
  const denom = reachableGaps ?? option.gapsTotal;
  const cleared = option.bottlenecksCleared;

  return (
    <div>
      <div className="grid grid-cols-3 gap-x-4">
        <Stat value={String(option.totalCredits)} label="Credits" />
        <Stat
          value={`${option.slotsUsed}/${slotsAvailable}`}
          label="Elective slots"
        />
        <Stat
          value={denom > 0 ? `${option.gapsClosed}/${denom}` : "0"}
          label="Skill gaps"
        />
      </div>

      <div className="mt-4 space-y-1 text-xs leading-relaxed text-muted-foreground">
        <p>{gapSentence(option, reachableGaps)}.</p>
        {/* §11.2: a gap whose only closers are prereq-blocked cannot be closed
            next term by any schedule, so it does not belong in the numerator's
            denominator. Saying where the rest went keeps the arithmetic whole. */}
        {blockedGaps !== undefined && blockedGaps > 0 && (
          <p>
            <span className="data">{blockedGaps}</span> more{" "}
            {blockedGaps === 1 ? "needs" : "need"} a prerequisite first.
          </p>
        )}
        {cleared > 0 && (
          <p>
            Takes <span className="data">{cleared}</span>{" "}
            {cleared === 1 ? "course" : "courses"} others are waiting on.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs">
        {/* Never "all prereqs met". See note 1 at the top of this file. */}
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-covered">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {"You've taken the listed prerequisites"}
          <span className="text-muted-foreground">{"(we can't see grades)"}</span>
        </span>
        {option.conflicts.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-covered">
            <Check className="size-3.5 shrink-0" aria-hidden />
            No time conflicts
          </span>
        ) : (
          <span className="inline-flex items-start gap-1.5 text-critical">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {option.conflicts.join("; ")}
          </span>
        )}
      </div>
    </div>
  );
}

/** The two sentences the model wrote. It never picked a course. §12.3. */
export function OptionProse({ option }: { option: ScheduleOption }) {
  return (
    <div className="space-y-3.5">
      <div>
        <p className="eyebrow text-muted-foreground">Why</p>
        <p className="mt-1.5 text-sm leading-relaxed text-pretty">
          {option.why}
        </p>
      </div>
      <div>
        <p className="eyebrow text-muted-foreground">Tradeoff</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">
          {option.tradeoff}
        </p>
      </div>
    </div>
  );
}

export interface ScheduleCardProps {
  option: ScheduleOption;
  /** "A", "B", "C". Position in the comparison, not part of the contract. */
  letter: string;
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /** skillId to skillName, so a row can name what it closes. */
  skillNames?: Record<string, string>;
  /**
   * Open gaps a course offered next term could actually close. The denominator
   * the student is measured against has to be one a schedule can reach, or
   * "closes 1 of 7" reads as a failing grade against an impossible target.
   */
  reachableGaps?: number;
  /** Open gaps whose only closers are prereq-blocked. The other half of the 7. */
  blockedGaps?: number;
  /** Still-needed required course codes, normalised. Drives the REQUIRED tag. */
  requiredCodes?: Set<string>;
  /** code to the still-needed courses waiting on it, for the disclosure. */
  dependentsOf?: Record<string, string[]>;
  /** skillId to how many pasted postings asked for it (SkillGap.demandCount). */
  skillDemand?: Record<string, number>;
  /** How many postings the student actually pasted. */
  postingCount?: number;
  /** "vs Option A: -CS 484, +STAT 354". Computed by ScheduleOptions. */
  diff?: string;
  selected?: boolean;
  onSelect: () => void;
  /**
   * NEW, optional. Render only these rows instead of every course in the
   * option. ScheduleOptions passes the courses that are NOT on the shared
   * spine, because the spine is stated once above rather than three times.
   * Defaults to the full course list, so an older caller is unaffected.
   */
  courses?: CourseRow[];
  /** NEW, optional. Flags the default recommendation. Defaults to false. */
  recommended?: boolean;
  /**
   * NEW, optional. One line naming the shared courses that were lifted out,
   * so a card showing two rows never looks like a two-course semester.
   */
  sharedNote?: string;
}

/**
 * One option, stacked. This is the sub-`lg` presentation: three columns cannot
 * survive 390px, so the comparison becomes one option per card and the diff
 * line at the top carries what the aligned grid carries on desktop.
 */
export function ScheduleCard({
  option,
  letter,
  slotsAvailable,
  skillNames,
  reachableGaps,
  blockedGaps,
  requiredCodes,
  dependentsOf,
  skillDemand,
  postingCount,
  diff,
  selected = false,
  onSelect,
  courses,
  recommended = false,
  sharedNote,
}: ScheduleCardProps) {
  const rows = courses ?? option.courses;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl bg-card transition-shadow",
        selected
          ? "ring-2 ring-brand shadow-md"
          : "ring-1 ring-foreground/10 hover:shadow-sm",
      )}
    >
      <header
        className={cn(
          "border-b border-rule px-5 py-4",
          recommended && !selected && "border-t-[3px] border-t-foreground",
          selected && "border-t-[3px] border-t-brand",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow text-muted-foreground">
            Option <span className="data text-foreground">{letter}</span>
          </p>
          {recommended && (
            <span className="eyebrow rounded-full bg-brand-soft px-2 py-1 text-brand">
              Recommended
            </span>
          )}
          {selected && (
            <span className="eyebrow inline-flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-white">
              <Check className="size-3" aria-hidden />
              In cart
            </span>
          )}
        </div>
        <h3 className="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-balance">
          {option.label}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {STRATEGY_LABEL[option.strategy]}
        </p>
        {/* The options share a required spine, so the thing to compare is this
            line. Plain hyphen and plus, never a dash. */}
        {diff && (
          <p className="data mt-3 rounded-md bg-canvas px-2.5 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground ring-1 ring-foreground/[0.07]">
            {diff}
          </p>
        )}
      </header>

      {rows.length > 0 ? (
        <ul className="divide-y divide-rule">
          {rows.map((course) => {
            const role = rowRole(course, requiredCodes);
            return (
              <li key={course.section.crn} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="data text-sm font-semibold">
                        {course.code}
                      </span>
                      <CourseTag role={role} />
                    </div>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">
                      {course.title}
                    </p>
                  </div>
                  <CrnLink
                    crn={course.section.crn}
                    code={course.code}
                    size="md"
                  />
                </div>
                <div className="mt-2 space-y-1.5">
                  <SectionFacts course={course} />
                  <ClosesLine course={course} skillNames={skillNames} />
                  <WhyThis
                    course={course}
                    role={role}
                    dependentsOf={dependentsOf}
                    skillNames={skillNames}
                    skillDemand={skillDemand}
                    postingCount={postingCount}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-b border-rule px-5 py-4 text-sm text-muted-foreground">
          Nothing here is unique to this option.
        </p>
      )}

      {sharedNote && (
        <p className="border-b border-rule bg-canvas px-5 py-2.5 text-xs text-muted-foreground">
          {sharedNote}
        </p>
      )}

      <div className="px-5 py-5">
        <OptionReadout
          option={option}
          slotsAvailable={slotsAvailable}
          reachableGaps={reachableGaps}
          blockedGaps={blockedGaps}
        />
        <div className="mt-5 border-t border-rule pt-4">
          <OptionProse option={option} />
        </div>
        <Button
          onClick={onSelect}
          variant={selected ? "outline" : "default"}
          size="lg"
          className="mt-5 h-11 w-full"
        >
          {selected ? "Selected" : "Take this schedule"}
        </Button>
      </div>
    </article>
  );
}
