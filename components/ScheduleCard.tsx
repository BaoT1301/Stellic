import { Check, ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";
import type { ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One of the three options — CLAUDE.md §13, State 4. Course rows, the stat
 * line, then the Why and Tradeoff prose the model wrote.
 *
 * Four things here are not cosmetic:
 *
 *  1. "You've taken the listed prerequisites", never "all prereqs met".
 *     PrereqRule.minGrade is extracted but unconsumable — StudentAudit
 *     .coursesTaken carries no grades — so the stronger claim is false for a
 *     student with a D. §8, §13. The "(we can't see grades)" gloss says why.
 *  2. The professor link is a constructed RateMyProfessors search URL that the
 *     student's own browser follows. §5 and §11.4: we never fetch it, and we
 *     never assert a rating. The wording is "look them up", not "rated 4.2".
 *  3. Every course row carries exactly one role tag once `requiredCodes` is
 *     passed. Screen 3 tells the student CS 321 and CS 405 can wait; without a
 *     tag, seeing both on all three cards here reads as the product
 *     contradicting itself. The vocabulary is screen 3's: "Take this term".
 *  4. The "Why this?" disclosure calls no model and makes no network request.
 *     It is the same computation that put the course on the card, printed. A
 *     model that gets a prerequisite wrong in front of a registrar is the worst
 *     failure available to this project, so nothing here is generated: if the
 *     OpenAI call that writes `why`/`tradeoff` degrades, this is unaffected.
 */

const STRATEGY_LABEL: Record<ScheduleOption["strategy"], string> = {
  // What §11.3 step 6 actually maximises, said in the student's words.
  "max-coverage": "Closes the most skill gaps",
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

/**
 * Banner writes Time="TBA" and Days="&nbsp;" for asynchronous sections, and
 * §9.1 normalises those to empty strings at parse time. Rendering has to honour
 * that or the 12h converter emits "NaN:NaN" on a schedule card.
 */
export function formatMeeting(section: Section): string {
  if (section.days === "" || section.startTime === "") {
    return "Asynchronous — no set meeting time";
  }
  return `${section.days} · ${formatTime(section.startTime)}–${formatTime(section.endTime)}`;
}

/**
 * The live public section detail page on Banner 8. Same trailing-slash gotcha
 * §9.1 documents for `p_disp_dyn_sched`: without the slash after the procedure
 * name Banner returns a 404.
 *
 * No login, no session, no cookie — the page a student would reach by hand, and
 * it carries the registration availability counts. That makes every CRN on this
 * card checkable against the university's own system in one click, which is the
 * cheapest verification of §10's "everything public is real" claim.
 */
export function bannerSectionUrl(crn: string): string {
  return `https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_detail_sched/?term_in=${NEXT_TERM_BANNER_CODE}&crn_in=${crn}`;
}

/**
 * Which of the three things a row can be. "unknown" is the honest state before
 * `requiredCodes` is threaded: labelling a required course "elective" would be
 * a false claim about the student's degree (§0 rule 7), so we print no tag at
 * all rather than guess.
 */
type RowRole = "waiting" | "required" | "elective" | "unknown";

function rowRole(course: CourseRow, requiredCodes?: Set<string>): RowRole {
  if (course.isBottleneck) return "waiting";
  if (!requiredCodes || requiredCodes.size === 0) return "unknown";
  return requiredCodes.has(normalizeCode(course.code))
    ? "required"
    : "elective";
}

const ROLE_TAG: Record<
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
 * Line 1 of the disclosure: why this course is on the card at all. Every branch
 * ends in a written sentence, including the two degraded ones, so the panel can
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
  return "Your prerequisites for it are done and its section fits around the rest of this card.";
}

/**
 * Line 3 of the disclosure. `formatMeeting` already covers the asynchronous
 * case, and Banner leaves the instructor blank often enough that the missing
 * case needs its own words rather than a dangling "with".
 */
function sectionSentence(course: CourseRow): string {
  const meeting = formatMeeting(course.section);
  const who = course.section.instructor
    ? ` with ${course.section.instructor}`
    : ", instructor not listed yet";
  return `${meeting}${who}.`;
}

export interface ScheduleCardProps {
  option: ScheduleOption;
  /** "A", "B", "C" — position in the row, not part of the contract. */
  letter: string;
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /** skillId → skillName, so a row can name what it closes. */
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
  /** code → the still-needed courses waiting on it, for the disclosure. */
  dependentsOf?: Record<string, string[]>;
  /** skillId → how many pasted postings asked for it (SkillGap.demandCount). */
  skillDemand?: Record<string, number>;
  /** How many postings the student actually pasted. */
  postingCount?: number;
  /** "vs Option A: -CS 484, +STAT 354". Computed by ScheduleOptions. */
  diff?: string;
  selected?: boolean;
  onSelect: () => void;
}

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
}: ScheduleCardProps) {
  const cleared = option.bottlenecksCleared;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card transition-shadow",
        selected
          ? "ring-2 ring-brand shadow-md"
          : "ring-1 ring-foreground/10 hover:shadow-sm",
      )}
    >
      <header className="border-b border-rule px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-muted-foreground">
            Option {letter} · {STRATEGY_LABEL[option.strategy]}
          </p>
          {selected && (
            <span className="eyebrow inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-brand">
              <Check className="size-3" aria-hidden />
              In cart
            </span>
          )}
        </div>
        <h3 className="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-balance">
          {option.label}
        </h3>
        {/* The three cards share a required spine, so the only thing a student
            has to compare is this line. Plain hyphen and plus, never a dash. */}
        {diff && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">{diff}</p>
        )}
      </header>

      <ul className="divide-y divide-rule">
        {option.courses.map((course) => {
          const closes = course.skillsClosed.length;
          const role = rowRole(course, requiredCodes);
          const tag = role === "unknown" ? null : ROLE_TAG[role];
          return (
            <li key={course.section.crn} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {course.code}
                    </span>
                    {tag && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase",
                          tag.className,
                        )}
                      >
                        {tag.icon && (
                          <TriangleAlert className="size-2.5" aria-hidden />
                        )}
                        {tag.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {course.title}
                  </p>
                </div>
                <a
                  href={bannerSectionUrl(course.section.crn)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`CRN ${course.section.crn}, the ${NEXT_TERM_LABEL} section of ${course.code}, on the public schedule of classes`}
                  title="Course reference number. Opens this section on the public schedule of classes."
                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[0.6875rem] text-muted-foreground tabular-nums underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
                >
                  {course.section.crn}
                  <ExternalLink className="size-2.5" aria-hidden />
                </a>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {formatMeeting(course.section)}
                </span>
                {course.section.modality !== "in-person" && (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {course.section.modality}
                  </span>
                )}
                {course.section.instructor && (
                  <a
                    href={course.rmpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
                    title={`Look up ${course.section.instructor} on RateMyProfessors`}
                  >
                    {course.section.instructor}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>

              {closes > 0 && (
                <p className="mt-1.5 text-xs text-covered">
                  Closes {closes} {closes === 1 ? "gap" : "gaps"}
                  {skillNames && skillNames[course.skillsClosed[0]!] ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {skillNames[course.skillsClosed[0]!]}
                      {closes > 1 ? ` +${closes - 1}` : ""}
                    </span>
                  ) : null}
                </p>
              )}

              <WhyThis
                course={course}
                role={role}
                dependentsOf={dependentsOf}
                skillNames={skillNames}
                skillDemand={skillDemand}
                postingCount={postingCount}
              />
            </li>
          );
        })}
      </ul>

      <div className="border-t border-rule bg-canvas px-5 py-4">
        <p className="text-sm font-medium tabular-nums">
          {option.totalCredits} credits
          <span className="text-muted-foreground">
            {" · "}
            Uses {option.slotsUsed} of your {slotsAvailable} open elective{" "}
            {slotsAvailable === 1 ? "slot" : "slots"}
          </span>
        </p>
        {cleared > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Takes {cleared} {cleared === 1 ? "course" : "courses"} others are
            waiting on
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {gapSentence(option, reachableGaps)}
        </p>
        {/* §11.2: a gap whose only closers are prereq-blocked cannot be closed
            next term by any schedule, so it does not belong in the numerator's
            denominator. Saying where the rest went keeps the arithmetic whole. */}
        {blockedGaps !== undefined && blockedGaps > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {blockedGaps} more {blockedGaps === 1 ? "needs" : "need"} a
            prerequisite first.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {/* Never "all prereqs met" — see the note at the top of this file. */}
          <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-covered">
            <Check className="size-3 shrink-0" aria-hidden />
            {"You've taken the listed prerequisites"}
            <span className="text-muted-foreground">
              {"(we can't see grades)"}
            </span>
          </span>
          {option.conflicts.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-covered">
              <Check className="size-3" aria-hidden />
              No time conflicts
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-critical">
              <TriangleAlert className="size-3" aria-hidden />
              {option.conflicts.join("; ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <Prose label="Why" body={option.why} />
        <Prose label="Tradeoff" body={option.tradeoff} muted />
        <Button
          onClick={onSelect}
          variant={selected ? "outline" : "default"}
          size="lg"
          className="mt-auto w-full"
        >
          {selected ? "Selected" : "Take this schedule"}
        </Button>
      </div>
    </article>
  );
}

/**
 * The honest denominator. `gapsTotal` counts every demanded skill, including
 * the ones no course the student can take next term closes — measuring a
 * schedule against a target it structurally cannot hit. When the caller passes
 * the reachable count we use it; when it does not, we fall back to the older
 * wording rather than print a number we cannot stand behind.
 */
function gapSentence(option: ScheduleOption, reachableGaps?: number): string {
  if (reachableGaps === undefined) {
    return `Closes ${option.gapsClosed} of ${option.gapsTotal} gaps`;
  }
  if (reachableGaps === 0) {
    return "None of your open skill gaps can be closed next term";
  }
  return `Closes ${option.gapsClosed} of the ${reachableGaps} skill gaps you can reach next term`;
}

/**
 * §5 rejected a chat box. The need it served — "why is this course here?" — is
 * met here instead: three template lines, no model, no fetch, no loading state,
 * no error state, and no state at all beyond the browser's own open/closed.
 * Native <details> is keyboard-operable and works on touch, which a hover
 * popover is not and does not.
 */
function WhyThis({
  course,
  role,
  dependentsOf,
  skillNames,
  skillDemand,
  postingCount,
}: {
  course: CourseRow;
  role: RowRole;
  dependentsOf?: Record<string, string[]>;
  skillNames?: Record<string, string>;
  skillDemand?: Record<string, number>;
  postingCount?: number;
}) {
  return (
    <details className="group/why mt-2">
      <summary className="flex cursor-pointer list-none items-center justify-end gap-1 text-xs text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
        Why this?
        <ChevronDown
          className="size-3 transition-transform group-open/why:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-2 space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed ring-1 ring-foreground/[0.07]">
        <p className="text-foreground">
          {roleSentence(course, role, dependentsOf)}
        </p>

        {course.skillsClosed.length > 0 ? (
          <div className="text-muted-foreground">
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
          <p className="text-muted-foreground">
            {
              "Doesn't close any of your open skill gaps. It is on this card for the degree, not for the job."
            }
          </p>
        )}

        <p className="text-muted-foreground">
          {sectionSentence(course)} CRN{" "}
          <a
            href={bannerSectionUrl(course.section.crn)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`CRN ${course.section.crn}, the ${NEXT_TERM_LABEL} section of ${course.code}, on the public schedule of classes`}
            className="font-mono underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
          >
            {course.section.crn}
          </a>{" "}
          is the number you paste into registration.
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

function Prose({
  label,
  body,
  muted = false,
}: {
  label: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-sm leading-relaxed text-pretty",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {body}
      </p>
    </div>
  );
}
