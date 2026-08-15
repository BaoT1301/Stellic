"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import { ArrowLeft } from "lucide-react";

import { Cart } from "@/components/Cart";
import { PreferenceToggles } from "@/components/PreferenceToggles";
import {
  ClosesLine,
  CourseTag,
  CrnLink,
  OptionProse,
  OptionReadout,
  SectionFacts,
  STRATEGY_LABEL,
  ScheduleCard,
  WhyThis,
  rowRole,
  type CourseRow,
} from "@/components/ScheduleCard";
import { Button } from "@/components/ui/button";
import { normalizeCode } from "@/lib/bottlenecks";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";
import type { Preferences, ScheduleOption } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * State 4, CLAUDE.md §13. It owns the longest block of the demo video, and the
 * version this replaced was three near-identical tall cards side by side. The
 * three options share most of their courses and differ in one or two rows, so
 * equal weight on everything made the actual DECISION invisible.
 *
 * The screen is now built in two halves, on two different surfaces:
 *
 *  FIXED, on ink. §11.3 step 2 puts the same critical, still-required courses
 *  on every option. Those are computed once, stated once, and rendered on the
 *  dark analysis surface with their real CRNs. They are not a choice, so they
 *  do not get three copies and they do not get a button.
 *
 *  THE DECISION, on paper. Everything the options do not share, laid out as an
 *  aligned comparison: one course per row, the same course on the same row in
 *  every column, so a missing cell is visible without reading a word. The
 *  recommended (or currently selected) option carries a card surface and a
 *  top accent so the row of columns is never three equal things.
 *
 * Below `lg` an aligned three-column comparison cannot survive 390px, so it
 * collapses deliberately: the fixed spine stays stated once at the top, and
 * each option becomes one stacked card showing only what is distinct about it,
 * with the diff line carrying what the grid carried.
 *
 * §11.3 step 7: "If fewer than three distinct combos exist, §13 renders FEWER
 * cards rather than duplicates." The column count follows `options.length`.
 */

const LETTERS = ["A", "B", "C", "D"];

/** A course is on the spine only if every option has it AND has the same CRN. */
const courseKey = (c: CourseRow) => `${normalizeCode(c.code)}|${c.section.crn}`;

const ROLE_RANK: Record<string, number> = {
  waiting: 0,
  required: 1,
  elective: 2,
  unknown: 3,
};

/**
 * §11.3 step 2 puts the same critical, still-required courses on every option,
 * so the options genuinely differ only in the elective slot. Saying that once,
 * above the comparison, turns "the model produced three near-copies" into
 * "here is the one real decision", and it is what the data actually shows.
 *
 * Plain hyphen and plus, never a dash: this line is read next to course codes.
 */
export function diffFromBase(
  base: ScheduleOption,
  option: ScheduleOption,
  baseLetter: string,
): string | undefined {
  const baseCodes = base.courses.map((c) => c.code);
  const codes = option.courses.map((c) => c.code);

  const parts = [
    ...baseCodes.filter((c) => !codes.includes(c)).map((c) => `-${c}`),
    ...codes.filter((c) => !baseCodes.includes(c)).map((c) => `+${c}`),
  ];

  const credits = option.totalCredits - base.totalCredits;
  if (credits !== 0) {
    parts.push(`${credits > 0 ? "+" : "-"}${Math.abs(credits)} credits`);
  }

  if (parts.length === 0) return undefined;
  return `vs Option ${baseLetter}: ${parts.join(", ")}`;
}

export interface ScheduleOptionsProps {
  options: ScheduleOption[];
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /** skillId to skillName, so a course row can name the gap it closes. */
  skillNames?: Record<string, string>;
  /** Open gaps a course offered next term could close, the honest denominator. */
  reachableGaps?: number;
  /** Open gaps whose only closers are prereq-blocked. */
  blockedGaps?: number;
  /** Still-needed required course codes, normalised. Drives the REQUIRED tag. */
  requiredCodes?: Set<string>;
  /** code to the still-needed courses waiting on it, for "Why this?". */
  dependentsOf?: Record<string, string[]>;
  /** skillId to how many pasted postings asked for it (SkillGap.demandCount). */
  skillDemand?: Record<string, number>;
  /** How many postings the student actually pasted. */
  postingCount?: number;
  preferences: Preferences;
  onPreferencesChange: (next: Preferences) => void;
  onRegenerate: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBack?: () => void;
  isWorking?: boolean;
  /** Toggles have moved since these options were built. */
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
  const selected = options.find((o) => o.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      cartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  /**
   * The spine is the intersection across every option, matched on course AND
   * CRN. Matching on the CRN too is deliberate: if one option puts the student
   * in a different section of the same course, that is a real difference and it
   * belongs in the comparison, not in the "this is fixed" block.
   */
  const { spine, diffRows, spineKeys } = useMemo(() => {
    if (options.length < 2) {
      return {
        spine: [] as CourseRow[],
        diffRows: [] as { code: string; sample: CourseRow; count: number }[],
        spineKeys: new Set<string>(),
      };
    }
    const sets = options.map((o) => new Set(o.courses.map(courseKey)));
    const shared = options[0]!.courses.filter((c) =>
      sets.every((s) => s.has(courseKey(c))),
    );
    const keys = new Set(shared.map(courseKey));

    const byCode = new Map<string, { sample: CourseRow; count: number }>();
    for (const option of options) {
      for (const course of option.courses) {
        if (keys.has(courseKey(course))) continue;
        const code = normalizeCode(course.code);
        const entry = byCode.get(code);
        if (entry) entry.count += 1;
        else byCode.set(code, { sample: course, count: 1 });
      }
    }

    const rows = [...byCode.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (ROLE_RANK[rowRole(a.sample, requiredCodes)] ?? 3) -
            (ROLE_RANK[rowRole(b.sample, requiredCodes)] ?? 3) ||
          a.code.localeCompare(b.code),
      );

    return { spine: shared, diffRows: rows, spineKeys: keys };
  }, [options, requiredCodes]);

  // Primacy is split in two on purpose. The COLUMN WIDTH follows the
  // recommendation and never moves, so selecting an option cannot reflow the
  // comparison under the pointer. The SURFACE follows the selection, so the
  // column you are choosing is always the lit one.
  const recommendedId = options[0]?.id ?? null;
  const featuredId = selectedId ?? recommendedId;
  const columnSurface = (id: string) =>
    id === featuredId ? "bg-card" : "bg-foreground/[0.025]";

  const sharedNote =
    spine.length > 0
      ? `Plus the ${spine.length} ${spine.length === 1 ? "course" : "courses"} every option includes, listed above.`
      : undefined;

  // The recommended column is given more room than the other two. Three equal
  // columns is exactly what made the old screen read as a wall.
  const gridTemplate = `13.5rem ${options
    .map((o) => (o.id === recommendedId ? "minmax(0, 1.2fr)" : "minmax(0, 1fr)"))
    .join(" ")}`;

  return (
    <section className="animate-in fade-in duration-500">
      {/* ------------------------------------------------------------------ *
       * FIXED. The ink band. Everything on it is settled before the student
       * makes any decision: the term, where the data came from, and the
       * courses that are on every option no matter what they pick.
       * ------------------------------------------------------------------ */}
      <header className="ink-band -mx-6 px-6 pt-9 pb-10 sm:pt-12 sm:pb-12">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <p className="eyebrow flex items-center gap-2.5 text-ink-muted">
            <span className="data text-ink-fg">04</span>
            <span aria-hidden className="h-px w-7 bg-ink-fg/30" />
            Next term
          </p>
          <p className="eyebrow text-ink-muted">
            {NEXT_TERM_LABEL} · term <span className="data">{NEXT_TERM_BANNER_CODE}</span>
          </p>
        </div>

        <div className="mt-7 grid gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-end">
          <h1 className="display text-[2.5rem] font-semibold sm:text-[3.25rem]">
            {options.length === 1
              ? "One schedule survived."
              : `${wordFor(options.length)} ways to spend next term.`}
          </h1>
          <p className="min-w-0 text-sm leading-relaxed text-ink-muted text-pretty sm:text-[0.9375rem]">
            Every course below has a real section with a real CRN. The model
            wrote the reasoning; it did not pick the courses. The combinations
            come from your requirements, the prerequisite graph and the
            published meeting times.
          </p>
        </div>

        {spine.length > 0 && (
          <div className="mt-10 border-t border-ink-rule pt-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
              <h2 className="text-base font-semibold tracking-tight">
                Every option includes these
              </h2>
              {/* ScheduleOption carries totalCredits but not per-course
                  credits, and §8 is frozen, so the spine's credit total is not
                  derivable. We print the count we have rather than a guessed
                  number. §0 rule 7. */}
              <p className="text-xs text-ink-muted">
                <span className="data text-ink-fg">{spine.length}</span>{" "}
                {spine.length === 1 ? "course" : "courses"} · on every option ·
                already fixed
              </p>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Your requirements and the prerequisite graph settled these. They
              are on every option, so they are not the decision. Register them
              whichever option you pick.
            </p>

            <ul className="mt-6 divide-y divide-ink-rule border-y border-ink-rule">
              {spine.map((course) => {
                const role = rowRole(course, requiredCodes);
                return (
                  <li
                    key={course.section.crn}
                    className="grid gap-x-8 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)_6.5rem] md:items-baseline"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="data text-[0.9375rem] font-semibold">
                          {course.code}
                        </span>
                        <CourseTag role={role} tone="ink" />
                      </div>
                      <p className="mt-1 text-sm leading-snug text-ink-muted">
                        {course.title}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <SectionFacts course={course} tone="ink" />
                      <ClosesLine
                        course={course}
                        skillNames={skillNames}
                        tone="ink"
                      />
                    </div>
                    <div className="md:justify-self-end">
                      <CrnLink
                        crn={course.section.crn}
                        code={course.code}
                        tone="ink"
                        size="md"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <WhyThis
                        course={course}
                        role={role}
                        dependentsOf={dependentsOf}
                        skillNames={skillNames}
                        skillDemand={skillDemand}
                        postingCount={postingCount}
                        tone="ink"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------------ *
       * The whole "talk to it" experience, §5 and §13. One row of toggles and
       * a rebuild. It sits between the fixed half and the decision because it
       * changes both.
       * ------------------------------------------------------------------ */}
      <div className="mt-8">
        <PreferenceToggles
          preferences={preferences}
          onChange={onPreferencesChange}
          onRegenerate={onRegenerate}
          isWorking={isWorking}
          dirty={dirty}
        />
      </div>

      {options.length === 0 ? (
        // §11.3 step 8 makes this unreachable, and §0 rule 3 says build it
        // anyway: a blank screen in the demo video is worse than any feature.
        <div className="mt-10 rounded-xl border border-dashed border-foreground/25 px-6 py-12 text-center">
          <p className="text-base font-medium">
            No conflict-free combination survived those preferences.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every candidate either overran the credit target or collided on the
            timetable. Turn one preference off above and rebuild.
          </p>
        </div>
      ) : (
        <div className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b-2 border-foreground pb-3">
            <h2 className="display text-2xl font-semibold sm:text-[1.75rem]">
              {options.length === 1 ? "What you would take" : "Where they differ"}
            </h2>
            {options.length > 1 && (
              <p className="text-xs text-muted-foreground">
                <span className="data text-foreground">{diffRows.length}</span>{" "}
                {diffRows.length === 1 ? "course" : "courses"} separate{" "}
                <span className="data text-foreground">{options.length}</span>{" "}
                options
              </p>
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Elective slots are the classes you actually get to pick. The rows
            below are the only thing that changes between options, so this is
            the whole decision.
          </p>

          {/* -------------------------------------------------------------- *
           * DESKTOP. One grid, no gaps, so every course row, every readout
           * and every button lands on the same line across all columns. The
           * left rail names the course once; the columns carry only what is
           * different about it, which is what makes the missing cells read.
           * -------------------------------------------------------------- */}
          {options.length > 1 && (
            <div
              className={cn(
                "mt-7 hidden lg:grid",
                isWorking && "opacity-60 transition-opacity",
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* --- header row --- */}
              <div className="min-w-0 border-t-[3px] border-b border-t-transparent border-b-rule py-5 pr-6">
                <p className="eyebrow text-muted-foreground">
                  How to read this
                </p>
                <p className="mt-2.5 text-sm leading-snug text-muted-foreground">
                  Same course, same row. A cell that says &ldquo;not in this
                  option&rdquo; is the difference.
                </p>
              </div>
              {options.map((option, i) => {
                const featured = option.id === featuredId;
                const isSelected = option.id === selectedId;
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "min-w-0 border-t-[3px] border-b border-l border-b-rule border-l-rule px-4 py-5",
                      columnSurface(option.id),
                      featured
                        ? isSelected
                          ? "border-t-brand"
                          : "border-t-foreground"
                        : "border-t-transparent",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="eyebrow text-muted-foreground">
                        Option{" "}
                        <span className="data text-foreground">
                          {LETTERS[i] ?? String(i + 1)}
                        </span>
                      </p>
                      {option.id === recommendedId && (
                        <span className="eyebrow rounded-full bg-brand-soft px-2 py-1 text-brand">
                          Recommended
                        </span>
                      )}
                      {isSelected && (
                        <span className="eyebrow rounded-full bg-brand px-2 py-1 text-white">
                          In cart
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2.5 text-[1.0625rem] leading-snug font-semibold tracking-tight text-balance">
                      {option.label}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {STRATEGY_LABEL[option.strategy]}
                    </p>
                    {i > 0 && (
                      <p className="data mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
                        {diffFromBase(options[0]!, option, LETTERS[0]!) ??
                          "vs Option A: same courses"}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* --- one row per course that is not on the spine --- */}
              {diffRows.map((row) => {
                const role = rowRole(row.sample, requiredCodes);
                return (
                  <Fragment key={row.code}>
                    <div className="min-w-0 border-b border-rule py-4 pr-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="data text-sm font-semibold">
                          {row.sample.code}
                        </span>
                        <CourseTag role={role} />
                      </div>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">
                        {row.sample.title}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        In <span className="data text-foreground">
                          {row.count}
                        </span>{" "}
                        of{" "}
                        <span className="data text-foreground">
                          {options.length}
                        </span>{" "}
                        options
                      </p>
                      <div className="mt-1">
                        <WhyThis
                          course={row.sample}
                          role={role}
                          dependentsOf={dependentsOf}
                          skillNames={skillNames}
                          skillDemand={skillDemand}
                          postingCount={postingCount}
                        />
                      </div>
                    </div>
                    {options.map((option) => {
                      const course = option.courses.find(
                        (c) =>
                          normalizeCode(c.code) === row.code &&
                          !spineKeys.has(courseKey(c)),
                      );
                      return (
                        <div
                          key={option.id + row.code}
                          className={cn(
                            "min-w-0 border-b border-l border-rule px-4 py-4",
                            columnSurface(option.id),
                          )}
                        >
                          {course ? (
                            <div className="space-y-1.5">
                              <CrnLink
                                crn={course.section.crn}
                                code={course.code}
                                size="md"
                              />
                              <SectionFacts course={course} />
                              <ClosesLine
                                course={course}
                                skillNames={skillNames}
                              />
                            </div>
                          ) : (
                            // Never colour alone, and never a bare dash: the
                            // absence is the information on this screen.
                            <p className="text-xs text-muted-foreground">
                              Not in this option
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* --- readout row --- */}
              <div className="min-w-0 border-b border-rule py-5 pr-6">
                <p className="text-sm font-semibold">The numbers</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Same denominators as the diagnosis screen, including the gaps
                  no schedule can reach next term.
                </p>
              </div>
              {options.map((option) => (
                <div
                  key={option.id + "-readout"}
                  className={cn(
                    "min-w-0 border-b border-l border-rule px-4 py-5",
                    columnSurface(option.id),
                  )}
                >
                  <OptionReadout
                    option={option}
                    slotsAvailable={slotsAvailable}
                    reachableGaps={reachableGaps}
                    blockedGaps={blockedGaps}
                  />
                </div>
              ))}

              {/* --- prose row --- */}
              <div className="min-w-0 border-b border-rule py-5 pr-6">
                <p className="text-sm font-semibold">In the model&rsquo;s words</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Written after the courses were chosen, never before. The
                  model does not pick courses.
                </p>
              </div>
              {options.map((option) => (
                <div
                  key={option.id + "-prose"}
                  className={cn(
                    "min-w-0 border-b border-l border-rule px-4 py-5",
                    columnSurface(option.id),
                  )}
                >
                  <OptionProse option={option} />
                </div>
              ))}

              {/* --- action row --- */}
              <div className="min-w-0 border-b border-rule py-5 pr-6">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Picking one loads its CRNs into the cart below.
                </p>
              </div>
              {options.map((option) => {
                const isSelected = option.id === selectedId;
                return (
                  <div
                    key={option.id + "-cta"}
                    className={cn(
                      "min-w-0 border-b border-l border-rule px-4 py-5",
                      columnSurface(option.id),
                    )}
                  >
                    <Button
                      onClick={() => onSelect(isSelected ? null : option.id)}
                      variant={isSelected ? "outline" : "default"}
                      size="lg"
                      className="h-11 w-full"
                    >
                      {isSelected ? "Selected" : "Take this schedule"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* -------------------------------------------------------------- *
           * MOBILE, and the single-option case. One option per card, showing
           * only what is distinct about it, because the shared spine is
           * already stated once on the ink band above.
           * -------------------------------------------------------------- */}
          <div
            className={cn(
              "mt-7 space-y-6",
              options.length > 1 && "lg:hidden",
              options.length === 1 && "max-w-2xl",
              isWorking && "opacity-60 transition-opacity",
            )}
          >
            {options.map((option, i) => (
              <ScheduleCard
                key={option.id}
                option={option}
                letter={LETTERS[i] ?? String(i + 1)}
                slotsAvailable={slotsAvailable}
                skillNames={skillNames}
                reachableGaps={reachableGaps}
                blockedGaps={blockedGaps}
                requiredCodes={requiredCodes}
                dependentsOf={dependentsOf}
                skillDemand={skillDemand}
                postingCount={postingCount}
                courses={
                  spineKeys.size > 0
                    ? option.courses.filter(
                        (c) => !spineKeys.has(courseKey(c)),
                      )
                    : option.courses
                }
                sharedNote={sharedNote}
                recommended={option.id === recommendedId && options.length > 1}
                diff={
                  i === 0
                    ? undefined
                    : diffFromBase(options[0]!, option, LETTERS[0]!)
                }
                selected={option.id === selectedId}
                onSelect={() =>
                  onSelect(option.id === selectedId ? null : option.id)
                }
              />
            ))}
          </div>
        </div>
      )}

      <div ref={cartRef} className="mt-12">
        {selected ? (
          <Cart option={selected} onClear={() => onSelect(null)} />
        ) : (
          options.length > 0 && (
            <div className="rounded-xl border border-dashed border-foreground/20 px-5 py-7 text-center">
              <p className="text-sm text-muted-foreground">
                Pick an option to see the CRNs you would paste into
                registration.
              </p>
            </div>
          )
        )}
      </div>

      {onBack && (
        <div className="mt-10 border-t border-rule pt-6">
          <Button variant="ghost" size="lg" onClick={onBack}>
            <ArrowLeft aria-hidden data-icon="inline-start" />
            Back to the diagnosis
          </Button>
        </div>
      )}
    </section>
  );
}

function wordFor(n: number): string {
  return ["Zero", "One", "Two", "Three", "Four"][n] ?? String(n);
}
