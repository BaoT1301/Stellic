"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

import { Cart } from "@/components/Cart";
import { PreferenceToggles } from "@/components/PreferenceToggles";
import { ScheduleCard } from "@/components/ScheduleCard";
import { Button } from "@/components/ui/button";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Preferences, ScheduleOption } from "@/lib/types";
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

  return (
    <section className="animate-in fade-in duration-500">
      <header className="max-w-3xl">
        <p className="eyebrow text-brand">Step 4 · {NEXT_TERM_LABEL}</p>
        <h1 className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Three ways to spend next term.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
          Every course below has a real section with a real CRN. The model wrote
          the reasoning; it did not pick the courses — the combinations are
          generated from your requirements, the prerequisite graph and the
          published meeting times.
        </p>
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

      {options.length > 1 && (
        <div className="mt-6 max-w-2xl">
          <p className="text-sm text-foreground">
            The required courses are on every option. The elective slot is where{" "}
            {options.length === 3 ? "the three" : "they"} differ.
          </p>
          {/* First and only place "slot" is glossed. §13's toggle row is right
              above this, so the gloss lands before the phrase is used on a card. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Elective slots are the classes you actually get to pick.
          </p>
        </div>
      )}

      {options.length === 0 ? (
        // §11.3 step 8 makes this unreachable, and §0 rule 3 says build it
        // anyway: a blank screen in the demo video is worse than any feature.
        <p className="mt-8 rounded-xl bg-card px-5 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          No conflict-free combination survived those preferences. Turn one off
          and regenerate.
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
      )}

      <div ref={cartRef} className="mt-8">
        {selected ? (
          <Cart option={selected} onClear={() => onSelect(null)} />
        ) : (
          options.length > 0 && (
            <p className="rounded-xl border border-dashed border-foreground/20 px-5 py-6 text-center text-sm text-muted-foreground">
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
