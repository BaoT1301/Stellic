"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Cart } from "@/components/Cart";
import { PreferenceToggles } from "@/components/PreferenceToggles";
import { ScheduleCard, weekBlocksFor } from "@/components/ScheduleCard";
import { weekBounds } from "@/components/WeekGrid";
import { Button } from "@/components/ui/button";
import { ineligibilityCopy } from "@/lib/prose";
import { rmpUrl } from "@/lib/rmp";
import type { Ineligibility } from "@/lib/schedules";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Preferences, ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * State 4 — CLAUDE.md §13. Three cards, one row of toggles, a regenerate
 * button, and the cart.
 *
 * The grid adapts to how many options actually came back. §11.3 step 7: "If
 * fewer than three distinct combos exist, §13 renders FEWER cards rather than
 * duplicates" — two visually identical cards on the screen that owns the
 * largest block of the video is the failure §18 finding 4 was about.
 */

const LETTERS = ["A", "B", "C", "D"];

/**
 * §11.3 step 2 puts the same critical, still-required courses on every option,
 * so the cards genuinely differ only in the elective slot. Saying that once,
 * above the row, turns "the model produced three near-copies" into "here is the
 * one real decision" — and it is what the data actually shows.
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
  /** skillId → skillName, so a course row can name the gap it closes. */
  skillNames?: Record<string, string>;
  /** Open gaps a course offered next term could close — the honest denominator. */
  reachableGaps?: number;
  /** Open gaps whose only closers are prereq-blocked. */
  blockedGaps?: number;
  /** Still-needed required course codes, normalised. Drives the REQUIRED tag. */
  requiredCodes?: Set<string>;
  /** code → the still-needed courses waiting on it, for "Why this?". */
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
  /**
   * Critical bottlenecks that reached none of these cards — §11.3 step 2
   * requires every one of them to be named as "see your advisor" instead.
   *
   * The half rejected at ELIGIBILITY time is on the diagnosis screen. These are
   * the ones that were eligible and still did not make it: the mustTake prefix
   * overran the credit target, or no section could be seated conflict-free. It
   * is listed here rather than there because it is computed against the LIVE
   * toggles, which are on this screen and not on that one.
   */
  unplacedCritical?: Ineligibility[];
  /** `StudentAudit.major`, only so a major-restriction line can quote it back. */
  auditMajor?: string;
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
  unplacedCritical = [],
  auditMajor = "",
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
   * With it in the cart alone, Option A's row read "CS 262 · TR 9:00 am · 79379"
   * while the cart six inches below read "MW 3:00 pm · 79435" — the same product
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

  return (
    <section className="animate-in fade-in duration-500">
      {/* No step eyebrow — the Stepper above says "Schedule" and the site header
          says "Planning Fall 2026". A tool screen, so 36/44px, not 52. */}
      {/* See the copy rule in JobPostingInput. The count is generated, not
          written: §11.3 step 7 renders FEWER cards rather than duplicates, so a
          hardcoded "Three" was also a claim the builder is allowed to break. */}
      <header className="max-w-3xl">
        <h1 className="text-3xl text-balance sm:text-4xl">
          {options.length <= 1
            ? `Your ${NEXT_TERM_LABEL} schedule`
            : `${options.length} ways to build ${NEXT_TERM_LABEL}`}
        </h1>
      </header>

      <div className="mt-8">
        <PreferenceToggles
          preferences={preferences}
          onChange={onPreferencesChange}
          onRegenerate={onRegenerate}
          isWorking={isWorking}
          dirty={dirty}
        />
      </div>

      {/*
        ONE line where there were two paragraphs and a lede. Both claims survive
        and they belong together anyway: the provenance beat (§16 — the model
        wrote the prose, not the course list) is the reason to trust the second
        half, which is that the cards differ only in the elective slot. Sitting
        directly above the cards is also where it is actually useful, rather than
        above the toggles where the lede used to be.
      */}
      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
        Every course has a real section with a real CRN, and the model wrote the
        reasoning rather than picking the courses.
        {options.length > 1 && (
          <>
            {" "}
            <span className="text-foreground">
              Required courses are on every option
            </span>{" "}
            — {options.length === 3 ? "the three" : "they"} differ only in the
            elective slot, the class you actually get to pick.
          </>
        )}
      </p>

      {/*
        §11.3 step 2: a critical bottleneck that reached no card must be named
        here, never silently dropped. Above the cards, because it changes how
        the cards should be read — the schedules below are the best available
        WITHOUT this course, not the best available.

        Same critical-soft treatment as the diagnosis screen's list, and the
        same `ineligibilityCopy`, so one verdict cannot acquire two voices.
      */}
      {unplacedCritical.length > 0 && (
        <ul className="mt-6 space-y-1.5 rounded-sm border border-critical/25 bg-critical-soft px-4 py-3 text-sm text-critical">
          {unplacedCritical.map((entry) => (
            <li key={entry.code}>
              <span className="font-mono font-semibold">{entry.code}</span>{" "}
              {ineligibilityCopy(entry, auditMajor)}
            </li>
          ))}
        </ul>
      )}

      {options.length === 0 ? (
        // §11.3 step 8 makes this unreachable, and §0 rule 3 says build it
        // anyway: a blank screen in the demo video is worse than any feature.
        //
        // It does NOT name a cause. This used to read "No conflict-free
        // combination survived those preferences", which is a specific,
        // checkable claim about the search — and the client also lands here
        // when the request fails, when the body is malformed, and (before the
        // toggles are ever touched) with all three preferences off. Blaming a
        // preference the student did not set is §0 rule 7 in miniature. The
        // toggles are named as something to TRY, not as the diagnosis.
        <p className="mt-8 rounded-md border border-rule bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          No schedule came back. Try regenerating, or turn off a preference
          below if any are on.
        </p>
      ) : (
        // No `items-start`: the cards stretch to equal height so ScheduleCard's
        // `mt-auto` lands all three "Take this schedule" buttons on one line.
        <div
          className={cn(
            "mt-5 grid gap-5",
            options.length === 1 && "max-w-xl",
            options.length === 2 && "lg:grid-cols-2",
            options.length >= 3 && "md:grid-cols-2 lg:grid-cols-3",
            isWorking && "opacity-60 transition-opacity",
          )}
        >
          {displayOptions.map((option, i) => (
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
              diff={
                i === 0
                  ? undefined
                  : diffFromBase(displayOptions[0]!, option, LETTERS[0]!)
              }
              week={week}
              selected={option.id === selectedId}
              onSelect={() =>
                onSelect(option.id === selectedId ? null : option.id)
              }
            />
          ))}
        </div>
      )}

      <div ref={cartRef} className="mt-8">
        {selected ? (
          <Cart
            option={selected}
            alternatesOf={alternatesOf}
            requiredCodes={requiredCodes}
            preferences={preferences}
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
            <p className="rounded-md border border-dashed border-foreground/25 px-5 py-6 text-center text-sm text-muted-foreground">
              Pick one to see the CRNs you would paste into registration.
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
