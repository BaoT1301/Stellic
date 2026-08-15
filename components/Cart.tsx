"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  bannerCourseUrl,
  bannerSectionUrl,
  formatMeeting,
  weekBlocksFor,
} from "@/components/ScheduleCard";
import { Sep } from "@/components/Sep";
import { WeekGrid, weekBounds } from "@/components/WeekGrid";
import { Button, buttonVariants } from "@/components/ui/button";
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
 * The linked-lab line is required and static. §9.1 drops non-lecture rows at
 * scrape time, which keeps the frozen Section contract simple but means a
 * course with a required laboratory shows only its lecture here.
 */

export interface CartProps {
  option: ScheduleOption;
  /** code → every Fall 2026 section of that course. Enables the section picker. */
  alternatesOf?: Record<string, Section[]>;
  /**
   * Still-needed required course codes. Only the grid uses it, and only so a
   * course is the same colour here as it is on the card six inches above —
   * without it every non-bottleneck block fell back to the neutral tone and the
   * elective changed colour between the two grids.
   */
  requiredCodes?: Set<string>;
  /** The live toggles, so a section that contradicts one can say so. */
  preferences?: Preferences;
  onSwapSection?: (code: string, crn: string) => void;
  onClear?: () => void;
}

export function Cart({
  option,
  alternatesOf,
  requiredCodes,
  preferences,
  onSwapSection,
  onClear,
}: CartProps) {
  const [copied, setCopied] = useState(false);
  const crns = option.courses.map((c) => c.section.crn);
  // The cart draws its own scale rather than sharing the cards'. There is only
  // one grid here, so there is no cross-grid comparison to get wrong — and a
  // swapped section can legitimately fall outside the bounds the three cards
  // shared.
  const blocks = weekBlocksFor(option, requiredCodes);
  const week = weekBounds(blocks);
  const asyncCodes = option.courses
    .filter((c) => c.section.days === "" || c.section.startTime === "")
    .map((c) => c.code);

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

  // The cart was the one shadow-e3 object in the app — the top of a three-level
  // elevation scale that no longer exists. It does not need depth to stand out:
  // it is the only brand-bordered block on the screen, it has a tinted header,
  // and it appears where nothing was. The slide-in went with the shadow; a fade
  // is enough to mark that it is new.
  return (
    <aside className="overflow-hidden rounded-md border border-brand bg-card animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule bg-brand-soft px-5 py-4">
        <div>
          <p className="eyebrow text-brand">Your cart</p>
          <h2 className="mt-1.5 text-xl">{option.label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">
              {NEXT_TERM_LABEL}
            </span>
            <Sep />
            <span>{option.courses.length} courses</span>
            <Sep />
            <span>{option.totalCredits} credits</span>
          </span>
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
        </div>
      </header>

      {(week || asyncCodes.length > 0) && (
        <div className="border-b border-rule px-5 py-4">
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
                "text-xs text-muted-foreground",
                week && "mt-2.5",
              )}
            >
              <span className="font-semibold">{asyncCodes.join(", ")}</span>{" "}
              {asyncCodes.length === 1 ? "is" : "are"} asynchronous — no set
              meeting time.
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-rule">
        {option.courses.map((course) => (
          <li key={course.code} className="px-5 py-3">
            <div className="flex items-center gap-4">
              {/* The CRN links to the section's own page on the public schedule
                  of classes — no login — so "are these real?" is one click, not a
                  claim. The trailing slash after the procedure name is required
                  or Banner 404s; see bannerSectionUrl and §9.1. */}
              <a
                href={bannerSectionUrl(course.section.crn)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`CRN ${course.section.crn}, the ${NEXT_TERM_LABEL} section of ${course.code}, on the public schedule of classes`}
                // text-lg/700 and not larger: at text-xl a five-digit CRN in
                // mono measures ~66px and overflows the w-16 gutter the rows
                // align on.
                className="w-16 shrink-0 text-lg leading-none font-bold tabular-nums underline decoration-dotted underline-offset-4 transition-colors hover:text-brand"
              >
                {course.section.crn}
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base">
                  <span className="font-bold">{course.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    {course.title}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {formatMeeting(course.section)}
                  </span>
                  {course.section.instructor ? `, ${course.section.instructor}` : ""}
                </p>
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
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4">
        {/* The CRNs travel to the mock registration page as a query param so it
            can prefill. §13: /register is deliberately plain and Banner-styled. */}
        <Link
          href={`/register?crns=${crns.join(",")}`}
          className={cn(buttonVariants({ variant: "default", size: "xl" }))}
        >
          Register these CRNs
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Link>
        <Button variant="outline" size="xl" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy CRNs"}
        </Button>
      </div>

      {/*
        Was three stacked paragraphs. Only one of them is a caveat the student
        can act on — §13 names the linked-lab line specifically and it stays
        whole. The other two described the UI rather than warning about it: that
        a swap does not change credits is visible in the header the moment you
        swap, and that a CRN opens Patriot Web is what the link's own title
        attribute and external-link icon already say.
      */}
      <p className="flex items-start gap-2 border-t border-rule bg-canvas px-5 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Some courses also require a linked lab or recitation section — check
        Patriot Web before submitting.
      </p>
    </aside>
  );
}

/**
 * Swap to another Fall 2026 section of the same course.
 *
 * This is the one real registration decision the toggles cannot express: "the
 * course is right, the 9 a.m. is not." 117 of the committed courses have more
 * than one Fall section, and until now the builder's pick was final.
 *
 * Three rules:
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
      <summary className="ml-20 flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
        {/* Counts the sections, not the alternatives: the list below includes the
            one already in the cart, marked as such. */}
        Change section ({sections.length} offered)
        <ChevronDown
          className="size-3 transition-transform group-open/sec:rotate-180"
          aria-hidden
        />
      </summary>

      <ul className="mt-1 ml-20 flex flex-col gap-1">
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
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors",
                  isCurrent && "bg-brand-soft text-brand",
                  !isCurrent && clash === undefined && "hover:bg-muted",
                  clash !== undefined && "cursor-not-allowed text-muted-foreground/70",
                )}
              >
                <span className="w-12 shrink-0 font-mono tabular-nums">
                  {section.crn}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono tabular-nums">
                    {formatMeeting(section)}
                  </span>
                  {section.instructor && (
                    <span className="text-muted-foreground">
                      , {section.instructor}
                    </span>
                  )}
                  {notes.length > 0 && !isCurrent && clash === undefined && (
                    <span className="block text-xs text-soon">
                      against your preferences: {notes.join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs">
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
        <p className="mt-1.5 ml-20 text-xs text-muted-foreground">
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
