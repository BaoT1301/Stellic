"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ROLE_TAG,
  bannerCourseUrl,
  bannerSectionUrl,
  formatMeeting,
  rowRole,
  weekBlocksFor,
  type RowRole,
} from "@/components/ScheduleCard";
import { WeekGrid, weekBounds } from "@/components/WeekGrid";
import { Button, buttonVariants } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { preferenceNotes, sectionsConflict } from "@/lib/schedules";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Preferences, ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * CLAUDE.md §13: "Selecting a card → cart: course list with CRNs, a copy button,
 * and a 'register' button that goes to /register."
 *
 * The CRN is the whole product claim. §4: we are the only thing that goes job
 * posting → O*NET work activity → a specific CRN the student can register for
 * next term. So the CRN is the largest type on this panel, not a footnote.
 *
 * REBUILT Aug 15 as the home for everything screen 4 no longer shows. The three
 * cards used to render fifteen to eighteen instructor names, meeting times,
 * professor links and skill sentences at once, of which a student uses at most
 * one card's worth. All of it lands here instead, AFTER the choice is made:
 * instructor and professor link per row, the model's one-sentence reason for
 * this schedule, and the per-course "Why this?" panel.
 *
 * The linked-lab line is required and static. §9.1 drops non-lecture rows at
 * scrape time, which keeps the frozen Section contract simple but means a
 * course with a required laboratory shows only its lecture here.
 */

type CourseRow = ScheduleOption["courses"][number];

export interface CartProps {
  option: ScheduleOption;
  /** code → every Fall 2026 section of that course. Enables the section picker. */
  alternatesOf?: Record<string, Section[]>;
  /**
   * Still-needed required course codes. The grid and the row tags use it, so a
   * course is the same colour and carries the same word here as it did on the
   * card six inches above.
   */
  requiredCodes?: Set<string>;
  /** The live toggles, so a section that contradicts one can say so. */
  preferences?: Preferences;
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable?: number;
  /** Open gaps a course offered next term could close — the honest denominator. */
  reachableGaps?: number;
  /** skillId → skillName. O*NET DWA titles, rendered verbatim (§9.3). */
  skillNames?: Record<string, string>;
  /** code → the still-needed courses waiting on it, for "Why this?". */
  dependentsOf?: Record<string, string[]>;
  /** skillId → how many pasted postings asked for it (SkillGap.demandCount). */
  skillDemand?: Record<string, number>;
  /** How many postings the student actually pasted. */
  postingCount?: number;
  onSwapSection?: (code: string, crn: string) => void;
  onClear?: () => void;
}

export function Cart({
  option,
  alternatesOf,
  requiredCodes,
  preferences,
  slotsAvailable,
  reachableGaps,
  skillNames,
  dependentsOf,
  skillDemand,
  postingCount,
  onSwapSection,
  onClear,
}: CartProps) {
  const [copied, setCopied] = useState(false);
  const crns = option.courses.map((c) => c.section.crn);
  // The cart draws its own scale rather than sharing the cards'. There is only
  // one grid here, so there is no cross-grid comparison to get wrong — and a
  // swapped section can legitimately fall outside the bounds the three cards
  // shared. No `sharedCodes` either: with one schedule on screen there is
  // nothing to be same or different from, so the grid colours by role.
  const blocks = weekBlocksFor(option, requiredCodes);
  const week = weekBounds(blocks);
  const asyncCodes = option.courses
    .filter((c) => c.section.days === "" || c.section.startTime === "")
    .map((c) => c.code);
  const skillTotal = reachableGaps ?? option.gapsTotal;

  async function copy() {
    const text = crns.join(", ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("CRNs copied", { description: text });
    } catch {
      // Clipboard access can be denied outright; never leave the student stuck.
      toast.error("Couldn't reach the clipboard", { description: text });
    }
  }

  return (
    <aside className="overflow-hidden rounded-xl bg-card ring-2 ring-brand/25 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule bg-brand-soft px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="eyebrow text-brand">Your cart · {NEXT_TERM_LABEL}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
            {option.courses.length} classes · {option.totalCredits} credits
          </h2>
        </div>
        {onClear && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Empty the cart"
            onClick={onClear}
          >
            <X aria-hidden />
          </Button>
        )}
      </header>

      {/* The model's reason for THIS schedule, shown for the one option the
          student actually picked rather than three times before they choose. */}
      {(option.why || option.tradeoff) && (
        <div className="space-y-1.5 border-b border-rule px-4 py-3.5 text-sm leading-relaxed sm:px-5">
          {option.why && <p className="text-pretty">{option.why}</p>}
          {option.tradeoff && (
            <p className="text-pretty text-muted-foreground">
              {option.tradeoff}
            </p>
          )}
        </div>
      )}

      {(week || asyncCodes.length > 0) && (
        <div className="border-b border-rule px-4 py-4 sm:px-5">
          {week && (
            <WeekGrid
              blocks={blocks}
              startHour={week.startHour}
              endHour={week.endHour}
              variant="full"
            />
          )}
          {/* Outside the `week` condition on purpose. An all-asynchronous cart
              makes weekBounds return null, and hiding this line with the grid
              would drop the one sentence explaining the missing week. */}
          {asyncCodes.length > 0 && (
            <p
              className={cn(
                "text-xs leading-relaxed text-muted-foreground",
                week && "mt-2.5",
              )}
            >
              <span className="font-mono">{asyncCodes.join(", ")}</span>
              {": no set meeting time."}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-rule">
        {option.courses.map((course) => {
          const role = rowRole(course, requiredCodes);
          const tag = role === "unknown" ? null : ROLE_TAG[role];
          return (
            <li key={course.code} className="px-4 py-3 sm:px-5">
              <div className="flex items-start gap-3 sm:gap-4">
                {/* The CRN links to the section's own page on the public schedule
                    of classes — no login — so "are these real?" is one click, not
                    a claim. The trailing slash after the procedure name is
                    required or Banner 404s; see bannerSectionUrl and §9.1. */}
                <a
                  href={bannerSectionUrl(course.section.crn)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`CRN ${course.section.crn}, the ${NEXT_TERM_LABEL} section of ${course.code}, on the public schedule of classes`}
                  className="w-14 shrink-0 py-0.5 font-mono text-base leading-none font-semibold tabular-nums underline decoration-dotted underline-offset-4 transition-colors hover:text-brand sm:w-16 sm:text-lg"
                >
                  {course.section.crn}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-medium">
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
                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatMeeting(course.section)}
                    </span>
                    {course.section.modality !== "in-person" && (
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {course.section.modality}
                      </span>
                    )}
                    {course.section.instructor && (
                      // §5 and §11.4: a constructed search URL the student's own
                      // browser follows. We never fetch it and never assert a
                      // rating. py-1 keeps the 24px target floor.
                      <a
                        href={course.rmpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 py-1 underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
                        title={`Look up ${course.section.instructor} on RateMyProfessors`}
                      >
                        {course.section.instructor}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>

                  <WhyThis
                    course={course}
                    role={role}
                    dependentsOf={dependentsOf}
                    skillNames={skillNames}
                    skillDemand={skillDemand}
                    postingCount={postingCount}
                  />
                </div>
              </div>

              {onSwapSection && (
                <SectionPicker
                  code={course.code}
                  current={course.section}
                  sections={alternatesOf?.[course.code] ?? []}
                  others={option.courses
                    .filter((c) => c.code !== course.code)
                    .map((c) => ({ code: c.code, section: c.section }))}
                  preferences={preferences}
                  onPick={(crn) => onSwapSection(course.code, crn)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-4 sm:px-5">
        {/* The CRNs travel to the mock registration page as a query param so it
            can prefill. §13: /register is deliberately plain and Banner-styled. */}
        <Link
          href={`/register?crns=${crns.join(",")}`}
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-11 flex-1 px-4 sm:flex-none",
          )}
        >
          Register these CRNs
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Link>
        <Button variant="outline" size="lg" className="h-11 px-4" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy CRNs"}
        </Button>
      </div>

      <div className="space-y-1.5 border-t border-rule bg-canvas px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
        {slotsAvailable !== undefined && (
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Uses {option.slotsUsed} of your {slotsAvailable} electives and covers{" "}
            {option.gapsClosed} of the {skillTotal} job skills you can reach next
            term.
          </p>
        )}
        <p className="flex items-start gap-2">
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Every CRN above opens that section on Patriot Web, where the seat count
          is listed.
        </p>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {LINKED_SECTION_NOTE}
        </p>
      </div>
    </aside>
  );
}

/**
 * §9.1 drops non-lecture rows at scrape time, so a course with a required
 * laboratory shows only its lecture. §13 makes this line mandatory, and
 * app/register/page.tsx says the same thing, so it is defined once here and
 * imported rather than written twice in two wordings that then drift.
 */
export const LINKED_SECTION_NOTE =
  "Some courses also require a linked lab or recitation section. Check Patriot Web before submitting.";

/**
 * §5 rejected a chat box. The need it served — "why is this course here?" — is
 * met here instead: template lines, no model, no fetch, no loading state, no
 * error state, and no state at all beyond the browser's own open/closed.
 * Native <details> is keyboard-operable and works on touch, which a hover
 * popover is not and does not.
 *
 * This used to render once per course on each of three cards, i.e. thirteen to
 * sixteen collapsed panels on the busiest screen. One per cart row is the same
 * feature at a fifth of the cost, and it is now next to the CRN it explains.
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
    <details className="group/why mt-1">
      {/* py-1 lifts this from 16px to 24px tall. WCAG 2.2 SC 2.5.8 sets 24x24
          CSS px as the minimum target. */}
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-xs text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
        Why this class?
        <ChevronDown
          className="size-3 transition-transform group-open/why:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-1.5 space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed ring-1 ring-foreground/[0.07]">
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
            This one is here for your degree, not for the job postings.
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Why this course is in the cart at all. Every branch ends in a written
 * sentence, including the two degraded ones, so the panel can never open empty.
 *
 * Never "others are waiting on it": "others" reads as other students. The
 * courses are what is waiting.
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
      return `Required, and ${n} ${n === 1 ? "class" : "classes"} you still need ${n === 1 ? "needs" : "need"} it first: ${dependents.join(", ")}.`;
    }
    return "Required, and other classes you still need are stuck behind it. The sooner it happens, the more of your degree stays reachable.";
  }
  if (role === "required") {
    return "Required for your degree. Nothing is stuck behind it, so the order is yours, but it has to happen sometime.";
  }
  if (role === "elective") {
    return "This is an elective. Your required classes are fixed; this is the part of next term you get to pick.";
  }
  return "Your prerequisites for it are done and it fits around the rest of this week.";
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
 * Swap to another Fall 2026 section of the same course.
 *
 * This is the one real registration decision the toggles cannot express: "the
 * course is right, the 9 a.m. is not." 117 of the committed courses have more
 * than one Fall section, and until now the builder's pick was final.
 *
 * Four rules:
 *  1. A conflicting section is SHOWN AND DISABLED, naming the course it collides
 *     with, rather than hidden. It is the conflict checker doing visible work, and
 *     it keeps `ScheduleOption.conflicts === []` (§8) true by construction —
 *     nothing selectable here can create a clash.
 *  2. A section that contradicts a live toggle is still selectable, and says so.
 *     The student is clicking it on purpose; silently hiding it would make a
 *     preference feel like a lock.
 *  3. `sectionsConflict` and `preferenceNotes` are imported from lib/schedules,
 *     never reimplemented. §11.3 compares minutes-since-midnight and treats
 *     asynchronous sections as never conflicting; a second copy of either here is
 *     exactly how the cart and the builder start disagreeing. The first draft of
 *     this component DID reimplement the morning test as `startTime < "10:00"`,
 *     which is a string compare that ranks 9 a.m. after 10 a.m. and only worked
 *     because §9.1 happens to zero-pad the hour.
 *  4. The list is CAPPED. Rendering every section is fine for CS 405 (11 next
 *     term) and absurd for ENGH 101 (74) or ENGH 302 (140), both of which are
 *     eligible for a student under `JUNIOR_STANDING_CREDITS` — the level floor in
 *     lib/bottlenecks.ts is the only thing keeping them off a card today, so this
 *     is one manual-entry audit away from a 140-button list inside the cart.
 */

/** Sections listed inline before the Patriot Web link takes over. */
const MAX_VISIBLE_SECTIONS = 6;
/**
 * How many CLASHING sections may occupy those slots. Rule 1 wants the conflict
 * checker visibly doing work, but ordering purely by time put four disabled rows
 * in CS 405's six — the sections nearest your current time are exactly the ones
 * most likely to collide with the rest of your week. Two is enough to show the
 * check happening without spending the list on rows nobody can pick.
 */
const MAX_VISIBLE_CLASHES = 2;

/** "13:30" → 810; null for an asynchronous section. Ordering only. */
function startMinutes(section: Section): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(section.startTime);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function SectionPicker({
  code,
  current,
  sections,
  others,
  preferences,
  onPick,
}: {
  code: string;
  current: Section;
  sections: Section[];
  others: { code: string; section: Section }[];
  preferences?: Preferences;
  onPick: (crn: string) => void;
}) {
  if (sections.length < 2) return null;

  // Which alternatives to show: the ones meeting nearest your current time, with
  // clashes capped so they cannot crowd out the sections you can actually pick.
  const currentStart = startMinutes(current);
  const nearestFirst = (a: Section, b: Section) => {
    const da = startMinutes(a);
    const db = startMinutes(b);
    if (da === null && db === null) return a.crn.localeCompare(b.crn);
    if (da === null) return 1; // asynchronous sorts last
    if (db === null) return -1;
    if (currentStart === null) return da - db || a.crn.localeCompare(b.crn);
    return (
      Math.abs(da - currentStart) - Math.abs(db - currentStart) ||
      a.crn.localeCompare(b.crn)
    );
  };

  const rest = sections.filter((s) => s.crn !== current.crn);
  const clashes = (s: Section) => others.some((o) => sectionsConflict(o.section, s));
  const clashing = rest.filter(clashes).sort(nearestFirst).slice(0, MAX_VISIBLE_CLASHES);
  const usable = rest
    .filter((s) => !clashes(s))
    .sort(nearestFirst)
    .slice(0, MAX_VISIBLE_SECTIONS - 1 - clashing.length);

  // Chronological below the pinned current row — a time-ordered list is what a
  // student is scanning for, even though "nearest yours" is what chose it.
  const byStart = (a: Section, b: Section) => {
    const da = startMinutes(a);
    const db = startMinutes(b);
    if (da === null && db === null) return a.crn.localeCompare(b.crn);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db || a.crn.localeCompare(b.crn);
  };
  const visible = [current, ...[...usable, ...clashing].sort(byStart)];
  const hidden = sections.length - visible.length;
  const allUrl = bannerCourseUrl(code);

  return (
    <details className="group/sec mt-1.5">
      {/* py-1.5 keeps the WCAG 2.2 SC 2.5.8 24px target floor. */}
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
        {/* Counts the sections, not the alternatives: the list below includes the
            one already in the cart, marked as such. */}
        Change the time · {sections.length} offered
        <ChevronDown
          className="size-3 transition-transform group-open/sec:rotate-180"
          aria-hidden
        />
      </summary>

      <ul className="mt-1 flex flex-col gap-1">
        {visible.map((section) => {
          const isCurrent = section.crn === current.crn;
          const clash = others.find((o) => sectionsConflict(o.section, section));
          const notes = preferences ? preferenceNotes(section, preferences) : [];

          return (
            <li key={section.crn}>
              <button
                type="button"
                disabled={isCurrent || clash !== undefined}
                onClick={() => onPick(section.crn)}
                aria-current={isCurrent ? "true" : undefined}
                // min-h-11 is the 44px floor this brief sets for the swap
                // control specifically; it is the one place a student is
                // tapping repeatedly to compare times.
                className={cn(
                  "flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  isCurrent && "bg-brand-soft text-brand",
                  !isCurrent && clash === undefined && "hover:bg-muted",
                  clash !== undefined && "cursor-not-allowed text-muted-foreground/70",
                )}
              >
                <span className="w-12 shrink-0 font-mono tabular-nums">
                  {section.crn}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="tabular-nums">{formatMeeting(section)}</span>
                  {section.instructor && (
                    <span className="text-muted-foreground"> · {section.instructor}</span>
                  )}
                  {notes.length > 0 && !isCurrent && clash === undefined && (
                    <span className="block text-[0.6875rem] text-soon">
                      against your preferences: {notes.join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[0.6875rem]">
                  {isCurrent
                    ? "in your cart"
                    : clash
                      ? `clashes with ${clash.code}`
                      : "use this one"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Never silently truncate. The count is the honest statement of what is
          not shown, and Patriot Web is where the rest actually live. */}
      {hidden > 0 && (
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Showing the {visible.length} closest to your current time.{" "}
          {allUrl ? (
            <a
              href={allUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
            >
              All {sections.length} sections of {code} on Patriot Web
            </a>
          ) : (
            <>All {sections.length} are listed on Patriot Web</>
          )}
          .
        </p>
      )}
    </details>
  );
}
