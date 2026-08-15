"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";

import { Cart } from "@/components/Cart";
import { PreferenceToggles } from "@/components/PreferenceToggles";
import {
  ScheduleCard,
  daysOnCampus,
  earliestStart,
  weekBlocksFor,
} from "@/components/ScheduleCard";
import { weekBounds } from "@/components/WeekGrid";
import { Button } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { rmpUrl } from "@/lib/rmp";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Preferences, ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * State 4 — CLAUDE.md §13. Three cards, one row of toggles, a regenerate
 * button, and the cart.
 *
 * REBUILT Aug 15 around one rule: NOTHING THAT IS THE SAME ON ALL THREE OPTIONS
 * MAY RENDER THREE TIMES. §11.3 step 2 puts the same still-required courses on
 * every option, so the cards genuinely differ only in the elective slot — and
 * the old screen made the student read three full columns to discover that. The
 * shared spine, the prerequisite caveat and the blocked-skill count are now
 * stated ONCE, above the row; each card renders only what is its own.
 *
 * The grid adapts to how many options actually came back. §11.3 step 7: "If
 * fewer than three distinct combos exist, §13 renders FEWER cards rather than
 * duplicates" — two visually identical cards on the screen that owns the
 * largest block of the video is the failure §18 finding 4 was about.
 *
 * Below 768px three columns cannot exist. Stacking them (the old behaviour, four
 * phone screens tall) forces comparison from memory. Instead: one card, a
 * segmented control labelled by the DIFFERENCE rather than by letter, and the
 * week held at a constant vertical offset so switching moves only the blocks.
 */

const LETTERS = ["A", "B", "C", "D"];

/**
 * The courses on EVERY option, in the order option A lists them.
 *
 * This is computed, never asserted. The old screen carried a hardcoded sentence
 * saying "the required courses are on every option" while Option B dropped two
 * of them — a false claim about a student's degree printed next to real course
 * codes, which §0 rule 7 treats as the worst class of defect in this project.
 * Now the screen can only ever name the courses that are actually shared.
 */
export function sharedCourseCodes(options: ScheduleOption[]): Set<string> {
  const [first, ...rest] = options;
  if (!first || options.length < 2) return new Set();

  const shared = new Set(first.courses.map((c) => c.code));
  for (const option of rest) {
    const codes = new Set(option.courses.map((c) => c.code));
    for (const code of [...shared]) if (!codes.has(code)) shared.delete(code);
  }
  return shared;
}

/**
 * Still-required courses this option leaves out that another option takes.
 *
 * A lighter term that quietly defers two required courses is exactly the
 * decision this product exists to make visible, and it used to be legible only
 * inside the unified-diff string.
 */
export function deferredRequired(
  option: ScheduleOption,
  options: ScheduleOption[],
  requiredCodes?: Set<string>,
): string[] {
  if (!requiredCodes || requiredCodes.size === 0) return [];

  const mine = new Set(option.courses.map((c) => normalizeCode(c.code)));
  const elsewhere = new Map<string, string>();
  for (const other of options) {
    if (other.id === option.id) continue;
    for (const course of other.courses) {
      elsewhere.set(normalizeCode(course.code), course.code);
    }
  }

  return [...elsewhere.entries()]
    .filter(([code]) => requiredCodes.has(code) && !mine.has(code))
    .map(([, display]) => display)
    .sort();
}

/**
 * One to three words per card, derived from numbers already on that card, so the
 * model's TRADEOFF paragraph can leave the header. A tag is only assigned when
 * exactly one option holds the extreme: with a tie there is nothing true to say.
 */
export function tradeoffTags(
  options: ScheduleOption[],
): Record<string, string | undefined> {
  const tags: Record<string, string | undefined> = {};
  if (options.length < 2) return tags;

  const soleExtreme = (
    value: (o: ScheduleOption) => number,
    pick: "min" | "max",
  ): ScheduleOption | undefined => {
    const scores = options.map(value);
    const target =
      pick === "min" ? Math.min(...scores) : Math.max(...scores);
    const hits = options.filter((_, i) => scores[i] === target);
    return hits.length === 1 ? hits[0] : undefined;
  };

  const assign = (option: ScheduleOption | undefined, label: string) => {
    if (option && tags[option.id] === undefined) tags[option.id] = label;
  };

  assign(soleExtreme((o) => o.gapsClosed, "max"), "Most job skills");
  assign(soleExtreme((o) => o.totalCredits, "min"), "Lightest");
  assign(soleExtreme((o) => daysOnCampus(o), "min"), "Fewest days");
  return tags;
}

export interface ScheduleOptionsProps {
  options: ScheduleOption[];
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /** skillId → skillName, so the cart can name the gap a course closes. */
  skillNames?: Record<string, string>;
  /** Open gaps a course offered next term could close — the honest denominator. */
  reachableGaps?: number;
  /** Open gaps whose only closers are prereq-blocked. */
  blockedGaps?: number;
  /** Still-needed required course codes, normalised. Drives the REQUIRED tag. */
  requiredCodes?: Set<string>;
  /** code → the still-needed courses waiting on it, for the cart's "Why this?". */
  dependentsOf?: Record<string, string[]>;
  /** skillId → how many pasted postings asked for it (SkillGap.demandCount). */
  skillDemand?: Record<string, number>;
  /** How many postings the student actually pasted. */
  postingCount?: number;
  /**
   * course code → every Fall 2026 section of that course, for the cart's section
   * picker. Comes from the raw catalog in app/page.tsx, NOT from the builder's
   * set: §11.3's `getEligibleCourses` caps at four sections per course and
   * pre-filters by preferences, so the pool the student should be able to see is
   * wider than the pool the search used.
   */
  alternatesOf?: Record<string, Section[]>;
  preferences: Preferences;
  onPreferencesChange: (next: Preferences) => void;
  onRegenerate: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBack?: () => void;
  isWorking?: boolean;
  /** Toggles have moved since these cards were built. */
  dirty?: boolean;
}

export function ScheduleOptions({
  options,
  slotsAvailable,
  skillNames,
  reachableGaps,
  blockedGaps,
  requiredCodes,
  dependentsOf,
  skillDemand,
  postingCount,
  alternatesOf,
  preferences,
  onPreferencesChange,
  onRegenerate,
  selectedId,
  onSelect,
  onBack,
  isWorking = false,
  dirty = false,
}: ScheduleOptionsProps) {
  const cartRef = useRef<HTMLDivElement>(null);

  /** Which card the phone shows. Ignored at 768px and up, where all three show. */
  const [active, setActive] = useState(0);

  /**
   * `${optionId}|${code}` → the CRN the student picked instead of the one the
   * builder chose. Held here rather than in app/page.tsx because this is where
   * `selected` already lives.
   *
   * The `builtFrom` field is what expires it. A regenerate replaces the `options`
   * array, and an override that outlived the schedule it belonged to would put a
   * CRN in the cart that no card on screen offers. Storing the array it was
   * captured against and comparing by identity DERIVES that, rather than clearing
   * it from an effect — a setState inside an effect body cascades a second render
   * pass on every rebuild, and React's lint rule rejects it outright.
   */
  const [overrideState, setOverrideState] = useState<{
    builtFrom: ScheduleOption[];
    map: Record<string, string>;
  }>({ builtFrom: options, map: {} });
  // useMemo, not a bare conditional: a fresh {} on the falsy branch every render
  // would change the identity of the derived-cart memo's dependencies each pass.
  const overrides = useMemo(
    () => (overrideState.builtFrom === options ? overrideState.map : {}),
    [overrideState, options],
  );

  const baseSelected = options.find((o) => o.id === selectedId) ?? null;

  /**
   * Every option with swapped sections substituted. Credits, gaps closed,
   * bottlenecks cleared and slots used are all section-independent, so nothing
   * numeric can drift when a section changes — only the CRN, the meeting time,
   * the instructor and their professor link.
   *
   * The substitution is applied to the CARDS as well as the cart, deliberately.
   * With it in the cart alone, Option A's week drew CS 262 on Tuesday morning
   * while the cart six inches below said Monday afternoon — the same product
   * stating two different meeting times for one course, which is the §0 rule 7
   * failure rather than a cosmetic one.
   */
  const displayOptions = useMemo(
    () =>
      options.map((option) => {
        const swapped = option.courses.map((course) => {
          const crn = overrides[`${option.id}|${course.code}`];
          if (!crn) return course;
          const section = (alternatesOf?.[course.code] ?? []).find((s) => s.crn === crn);
          if (!section) return course;
          return { ...course, section, rmpUrl: rmpUrl(section.instructor) };
        });
        return swapped.some((c, i) => c !== option.courses[i])
          ? { ...option, courses: swapped }
          : option;
      }),
    [options, overrides, alternatesOf],
  );

  const selected = displayOptions.find((o) => o.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      cartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Only on which card is selected — re-running on every section swap would
    // yank the page while the student is comparing times inside the picker.
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A rebuild can return fewer options than the tab that was open.
  const activeIndex = Math.min(active, Math.max(0, displayOptions.length - 1));

  const shared = useMemo(
    () => sharedCourseCodes(displayOptions),
    [displayOptions],
  );
  const sharedList = useMemo(
    () =>
      displayOptions[0]?.courses
        .map((c) => c.code)
        .filter((code) => shared.has(code)) ?? [],
    [displayOptions, shared],
  );
  const tags = useMemo(() => tradeoffTags(displayOptions), [displayOptions]);

  /**
   * ONE vertical scale for all three grids. Computed across every option's
   * sections, so the cards are directly comparable; see WeekGrid's header for why
   * per-card bounds would be worse than no grid at all.
   */
  const week = useMemo(
    () =>
      weekBounds(
        displayOptions.flatMap((option) => weekBlocksFor(option, requiredCodes)),
      ) ?? undefined,
    [displayOptions, requiredCodes],
  );

  const groupWord =
    displayOptions.length === 2
      ? "both"
      : displayOptions.length === 3
        ? "all three"
        : `all ${displayOptions.length}`;

  return (
    <section className="animate-in fade-in duration-500">
      <header className="max-w-2xl">
        <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Three ways to spend next term.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Every class here is a real {NEXT_TERM_LABEL} section with a real CRN.
        </p>
        {/* The provenance claim is the reason a registrar trusts this screen, so
            it is kept in full. It is not what a student needs in order to
            choose, so it is one click away. */}
        <details className="group/prov mt-2">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
            How were these built?
            <ChevronDown
              className="size-3.5 transition-transform group-open/prov:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The model wrote the summaries. It did not pick the courses. Every
            combination is generated from your remaining requirements, the
            published prerequisites and the published meeting times.
          </p>
        </details>
      </header>

      <div className="mt-7">
        <PreferenceToggles
          preferences={preferences}
          onChange={onPreferencesChange}
          onRegenerate={onRegenerate}
          isWorking={isWorking}
          dirty={dirty}
        />
      </div>

      {/* THE SHARED STRIP. Everything on it used to render once per card. */}
      {displayOptions.length > 1 && (
        <div className="mt-5 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:px-5">
          {sharedList.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-sm font-medium">
                On {groupWord}
                {": "}
              </span>
              {sharedList.map((code) => (
                <span
                  key={code}
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium"
                >
                  {code}
                </span>
              ))}
            </div>
          )}
          <div
            className={cn(
              "space-y-1 text-xs leading-relaxed text-muted-foreground",
              sharedList.length > 0 && "mt-2.5",
            )}
          >
            {/* Never "all prereqs met": PrereqRule.minGrade is extracted but
                StudentAudit.coursesTaken carries no grades, so the stronger
                claim is false for a student with a D. §8, §13. */}
            <p>
              {"You've done the prerequisites we can see. We can't see grades."}
            </p>
            {/* §11.2: a skill whose only closers are prereq-blocked cannot be
                closed next term by any schedule, so it does not belong in the
                denominator. Saying where the rest went keeps it honest. */}
            {blockedGaps !== undefined && blockedGaps > 0 && (
              <p>
                {blockedGaps} more job {blockedGaps === 1 ? "skill" : "skills"}{" "}
                {blockedGaps === 1 ? "needs" : "need"} a class you have not taken
                yet.
              </p>
            )}
            {/* The "*" clause is gated on there actually being a shared spine:
                with no overlap nothing is marked, and the sentence would be
                describing a glyph that is not on screen. */}
            <p>
              Electives are the classes you get to pick.
              {sharedList.length > 0
                ? " In each week below, * marks what only that option has."
                : ""}
            </p>
          </div>
        </div>
      )}

      {options.length === 0 ? (
        // §11.3 step 8 makes this unreachable, and §0 rule 3 says build it
        // anyway: a blank screen in the demo video is worse than any feature.
        <p className="mt-8 rounded-xl bg-card px-5 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          Nothing fits those settings. Turn one off and rebuild.
        </p>
      ) : (
        <>
          {/* PHONE ONLY: pick a card by its difference, not by its letter. Plain
              toggle buttons with aria-pressed rather than the tab/tabpanel
              contract, which needs wiring this layout does not have. */}
          {displayOptions.length > 1 && (
            // top-16 clears app/page.tsx's own h-16 sticky header, and z-10
            // sits under its z-20 so the two never fight.
            <div className="sticky top-16 z-10 -mx-1 mt-5 bg-canvas px-1 py-2 md:hidden">
              <div
                role="group"
                aria-label="Choose which schedule to look at"
                className="flex gap-1 rounded-xl bg-muted p-1"
              >
                {displayOptions.map((option, i) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={i === activeIndex}
                    // The visible label is the difference, not the letter, but a
                    // screen reader gets the letter too so the tab and the card
                    // heading below it are the same thing.
                    aria-label={`Option ${LETTERS[i] ?? i + 1}: ${option.totalCredits} credits, ${daysOnCampus(option)} days on campus`}
                    onClick={() => setActive(i)}
                    className={cn(
                      "min-h-11 flex-1 rounded-lg px-1 py-1.5 text-center transition-colors",
                      i === activeIndex
                        ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block text-sm leading-tight font-semibold tabular-nums">
                      {option.totalCredits} cr
                    </span>
                    <span className="block text-[0.6875rem] leading-tight tabular-nums">
                      {daysOnCampus(option)} days
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className={cn(
              "mt-4 grid gap-5 md:mt-5",
              options.length === 1 && "max-w-xl",
              options.length === 2 && "md:grid-cols-2",
              options.length >= 3 && "md:grid-cols-2 lg:grid-cols-3",
              isWorking && "opacity-60 transition-opacity",
            )}
          >
            {displayOptions.map((option, i) => (
              <div
                key={option.id}
                className={cn("flex", i !== activeIndex && "hidden md:flex")}
              >
                <ScheduleCard
                  option={option}
                  letter={LETTERS[i] ?? String(i + 1)}
                  slotsAvailable={slotsAvailable}
                  reachableGaps={reachableGaps}
                  requiredCodes={requiredCodes}
                  sharedCodes={shared.size > 0 ? shared : undefined}
                  tag={tags[option.id]}
                  deferredRequired={deferredRequired(
                    option,
                    displayOptions,
                    requiredCodes,
                  )}
                  week={week}
                  selected={option.id === selectedId}
                  onSelect={() =>
                    onSelect(option.id === selectedId ? null : option.id)
                  }
                />
              </div>
            ))}
          </div>

          {/* PHONE ONLY: four rows of pure numerals. A table beats cards for
              comparing several values at once, because adjacent numbers need no
              eye travel and no memory. */}
          {displayOptions.length > 1 && (
            <details className="group/cmp mt-4 md:hidden">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
                Compare {groupWord}
                <ChevronDown
                  className="size-3.5 transition-transform group-open/cmp:rotate-180"
                  aria-hidden
                />
              </summary>
              <table className="mt-2 w-full table-fixed text-xs">
                <caption className="sr-only">
                  The three schedules compared
                </caption>
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="w-2/5 py-1.5 text-left font-medium text-muted-foreground">
                      <span className="sr-only">Measure</span>
                    </th>
                    {displayOptions.map((option, i) => (
                      <th
                        key={option.id}
                        scope="col"
                        className="py-1.5 text-right font-semibold"
                      >
                        {LETTERS[i] ?? String(i + 1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <CompareRow
                    label="Credits"
                    options={displayOptions}
                    value={(o) => String(o.totalCredits)}
                  />
                  <CompareRow
                    label="Days on campus"
                    options={displayOptions}
                    value={(o) => String(daysOnCampus(o))}
                  />
                  <CompareRow
                    label="Earliest class"
                    options={displayOptions}
                    value={(o) => earliestStart(o) ?? "none"}
                  />
                  <CompareRow
                    label="Job skills"
                    options={displayOptions}
                    value={(o) =>
                      `${o.gapsClosed} of ${reachableGaps ?? o.gapsTotal}`
                    }
                  />
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      <div ref={cartRef} className="mt-8">
        {selected ? (
          <Cart
            option={selected}
            alternatesOf={alternatesOf}
            requiredCodes={requiredCodes}
            preferences={preferences}
            slotsAvailable={slotsAvailable}
            reachableGaps={reachableGaps}
            skillNames={skillNames}
            dependentsOf={dependentsOf}
            skillDemand={skillDemand}
            postingCount={postingCount}
            onSwapSection={(code, crn) => {
              const key = `${selected.id}|${code}`;
              const next = { ...overrides };
              // Picking the builder's own section back out removes the override
              // rather than pinning it, so "no override" and "the same CRN" stay
              // the same state.
              const original = baseSelected?.courses.find((c) => c.code === code);
              if (!original || original.section.crn === crn) delete next[key];
              else next[key] = crn;
              setOverrideState({ builtFrom: options, map: next });
            }}
            onClear={() => onSelect(null)}
          />
        ) : (
          options.length > 0 && (
            <p className="rounded-xl border border-dashed border-foreground/20 px-5 py-6 text-center text-sm text-muted-foreground">
              Pick one to get your CRNs.
            </p>
          )
        )}
      </div>

      {onBack && (
        <div className="mt-8 border-t border-rule pt-6">
          <Button variant="ghost" size="lg" onClick={onBack}>
            <ArrowLeft aria-hidden data-icon="inline-start" />
            Back to the diagnosis
          </Button>
        </div>
      )}
    </section>
  );
}

function CompareRow({
  label,
  options,
  value,
}: {
  label: string;
  options: ScheduleOption[];
  value: (option: ScheduleOption) => string;
}) {
  return (
    <tr className="border-b border-rule/70">
      <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
        {label}
      </th>
      {options.map((option) => (
        <td key={option.id} className="py-2 text-right font-medium">
          {value(option)}
        </td>
      ))}
    </tr>
  );
}
