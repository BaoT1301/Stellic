"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight } from "lucide-react";

import { BottleneckCard } from "@/components/BottleneckCard";
import { GapMap } from "@/components/GapMap";
import { Button } from "@/components/ui/button";
import type { DelayImpact } from "@/lib/bottlenecks";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Bottleneck, SkillGap, StudentAudit } from "@/lib/types";

/**
 * State 3 — CLAUDE.md §13.
 *
 * THE ONE THING. A student has five seconds here, and in those five seconds
 * they should learn which single course is urgent and what happens if they skip
 * it. So the screen is built as: verdict, then the proof, then everything else,
 * visibly smaller.
 *
 *   1. A headline that NAMES the course and states the consequence. Derived,
 *      never hardcoded — §13 is explicit that its own example is illustrative.
 *   2. The hero card, full width, with the prerequisite chain drawn large. The
 *      drawing is the argument; it needs no reading.
 *   3. Two columns of secondary material: the rest of the requirements, and the
 *      gap map.
 *   4. One primary action. Bottom-right on a laptop, a sticky bar on a phone.
 *
 * What was cut, and why: the step eyebrow (the stepper 40px above already
 * numbers and names the step), the "what's holding up the rest of your degree"
 * heading and its explanatory sentence (the urgency chip on each card says the
 * same thing, once), the group eyebrows (same reason), and the five-cell facts
 * table (folded into one wrapping line so the verdict is what sits above the
 * fold). Nothing factual was dropped: the catalog year, the credit count, the
 * graduation month and the terms-left count are all still on screen.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2027-05" → "May 2027". The contract pins the pattern to ^\d{4}-\d{2}$. */
function formatGraduation(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : value;
}

/** Course codes are mono everywhere else in the app; they stay mono in prose. */
function Code({ children }: { children: string }) {
  return <span className="font-mono font-semibold">{children}</span>;
}

/**
 * "CS 367 and CS 471", or "CS 367, CS 471 and 2 more".
 *
 * Two codes is the readable ceiling for a headline. The full list is always one
 * disclosure away on the card below, so nothing is hidden — only shortened.
 */
function listCodes(codes: string[]): string {
  const shown = codes.slice(0, 2);
  const extra = codes.length - shown.length;
  if (extra > 0) return `${shown.join(", ")} and ${extra} more`;
  if (shown.length === 2) return shown.join(" and ");
  return shown[0] ?? "";
}

function terms(n: number): string {
  return `${n} ${n === 1 ? "term" : "terms"}`;
}

export interface DiagnosisScreenProps {
  audit: StudentAudit;
  bottlenecks: Bottleneck[];
  gaps: SkillGap[];
  /** course code → title, for dependent chips and chain nodes. */
  titles?: Record<string, string>;
  /** course code → its direct prerequisites, for the chain's left-hand node. */
  prereqsOf?: Record<string, string[]>;
  /**
   * course code → what one term of delay costs it (§11.1's chain arithmetic).
   * Computed in app/page.tsx, which is the only place holding the prereq graph.
   */
  delays?: Record<string, DelayImpact>;
  postingCount?: number;
  /**
   * Critical bottlenecks with no section next term. §11.3 step 2 requires these
   * to appear here as "see your advisor" and NEVER on a schedule card.
   */
  unofferedCritical?: string[];
  onContinue: () => void;
  onBack?: () => void;
  isWorking?: boolean;
}

export function DiagnosisScreen({
  audit,
  bottlenecks,
  gaps,
  titles,
  prereqsOf,
  delays,
  postingCount,
  unofferedCritical = [],
  onContinue,
  onBack,
  isWorking = false,
}: DiagnosisScreenProps) {
  const critical = bottlenecks.filter((b) => b.urgency === "critical");
  const soon = bottlenecks.filter((b) => b.urgency === "soon");
  const flexible = bottlenecks.filter((b) => b.urgency === "flexible");

  // The hero is the deepest critical course — the one whose chain is worth
  // drawing. Falls back to the deepest "soon" so the drawing never disappears
  // just because a student happens to be in good shape. Split in two rather
  // than sorting one concatenated list, so a tie can never promote a "soon"
  // course above a "critical" one.
  const deepest = (list: Bottleneck[]): Bottleneck | null =>
    [...list].sort((a, b) => b.chainDepth - a.chainDepth)[0] ?? null;
  const hero = critical.length > 0 ? deepest(critical) : deepest(soon);
  const heroHasChain = hero !== null && hero.chainDepth > 0;
  const heroDelay = hero ? delays?.[hero.code] : undefined;

  // Section one is every critical course, hero first. With no criticals it is
  // the single deepest "soon" course, so the screen always leads with something
  // rather than opening on a column of equal-weight cards.
  const headline = critical.length > 0 ? critical : hero ? [hero] : [];
  const headlineOrdered = hero
    ? [hero, ...headline.filter((b) => b.code !== hero.code)]
    : headline;
  const headlineCodes = new Set(headlineOrdered.map((b) => b.code));
  const rest = [...critical, ...soon].filter((b) => !headlineCodes.has(b.code));

  const graduation = formatGraduation(audit.expectedGraduation);
  const termsLeft = bottlenecks[0]?.termsRemaining;

  return (
    <section className="animate-in fade-in duration-500">
      {/* Back lives at the top-left on a phone, which is where a thumb looks
          for it, and keeps the sticky bar below to exactly one action. */}
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={isWorking}
          className="-ml-2.5 mb-5 md:hidden"
        >
          <ArrowLeft aria-hidden data-icon="inline-start" />
          Back
        </Button>
      )}

      <header className="max-w-3xl">
        <h1 className="text-[2rem] leading-[1.12] font-semibold tracking-tight text-balance sm:text-[2.75rem]">
          {hero ? (
            hero.urgency === "critical" ? (
              <>
                Take <Code>{hero.code}</Code> this term or you graduate late.
              </>
            ) : (
              <>
                Take <Code>{hero.code}</Code> this term or next.
              </>
            )
          ) : (
            <>Nothing is holding up your degree.</>
          )}
        </h1>

        {/* One sentence, and it is the CONSEQUENCE rather than a restatement of
            the headline. delayImpact already prices a term of slippage in this
            student's own courses; saying it here is what makes the number on
            the card below worth opening. */}
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">
          {hero ? (
            heroDelay && heroDelay.atRisk.length > 0 ? (
              <>
                Wait one term and {listCodes(heroDelay.atRisk)} no longer fit.
              </>
            ) : hero.dependents.length > 0 ? (
              <>
                {hero.dependents.length}{" "}
                {hero.dependents.length === 1 ? "class" : "classes"} you still
                need {hero.dependents.length === 1 ? "is" : "are"} stuck behind
                it. You have {terms(hero.termsRemaining)} left.
              </>
            ) : (
              <>
                You have {terms(hero.termsRemaining)} left, and this one cannot
                slip.
              </>
            )
          ) : (
            <>You can take what is left in any order. Your electives are the real decision.</>
          )}
        </p>

        {/*
          The five audit facts, on one wrapping line instead of a five-cell
          table. Catalog year decides which requirement set is even valid, so a
          registrar looks for it first and it stays on screen; it just no longer
          costs 600px of a phone before the student reaches the verdict.
        */}
        <dl className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <Fact label="Program" value={audit.major} />
          <Fact
            label="Credits"
            value={`${audit.creditsCompleted} of ${audit.creditsRequired}`}
          />
          <Fact label="Graduating" value={graduation ?? "not on file"} />
          {termsLeft !== undefined && (
            <Fact
              label="Terms left"
              value={terms(termsLeft)}
              emphasis={termsLeft <= 2}
            />
          )}
          <Fact label="Catalog" value={audit.catalogYear ?? "not on file"} />
        </dl>
      </header>

      {/* ---- The urgent thing, full width, with the chain drawn large ---- */}
      {headlineOrdered.length > 0 && (
        <div className="mt-9 flex flex-col gap-4">
          {headlineOrdered.map((b) => (
            <BottleneckCard
              key={b.code}
              bottleneck={b}
              titles={titles}
              completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
              showChain={heroHasChain && b.code === hero?.code}
              hero={b.code === hero?.code}
              delay={delays?.[b.code]}
            />
          ))}
        </div>
      )}

      {unofferedCritical.length > 0 && (
        <p className="mt-4 rounded-lg bg-critical-soft px-4 py-3 text-sm leading-relaxed text-critical">
          <span className="font-mono font-medium">
            {unofferedCritical.join(", ")}
          </span>{" "}
          {unofferedCritical.length === 1 ? "has" : "have"} no{" "}
          {NEXT_TERM_LABEL} section, so we cannot include{" "}
          {unofferedCritical.length === 1 ? "it" : "them"}. Ask your advisor.
        </p>
      )}

      {/*
        min-w-0 on BOTH children is load-bearing, not tidiness. The
        minmax(0,...) that prevents grid blowout only applies at lg:; below that
        the implicit single column is `auto` and a grid item's default
        `min-width: auto` refuses to shrink below its content's min-content
        width. Measured at 390px before this fix: the column rendered 596px wide
        and the page scrolled sideways to 620px.
      */}
      <div className="mt-12 grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          {(rest.length > 0 || flexible.length > 0) && (
            <h2 className="text-lg font-semibold tracking-tight">
              {headlineOrdered.length > 0
                ? "Everything else you still need"
                : "What you still need"}
            </h2>
          )}

          {rest.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {rest.map((b) => (
                <BottleneckCard
                  key={b.code}
                  bottleneck={b}
                  titles={titles}
                  completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
                  delay={delays?.[b.code]}
                />
              ))}
            </div>
          )}

          <NoRushGroup codes={flexible.map((b) => b.code)}>
            {flexible.map((b) => (
              <BottleneckCard key={b.code} bottleneck={b} titles={titles} />
            ))}
          </NoRushGroup>
        </div>

        <GapMap gaps={gaps} postingCount={postingCount} className="min-w-0" />
      </div>

      {/*
        One primary action, in the same place on every step: bottom-right of the
        content column on a laptop, a sticky full-width bar on a phone. The
        phone version holds exactly one control — Back is at the top of the
        screen — so there is never a question about what to press next. The
        negative margin bleeds the bar to the page edges inside the px-6 shell
        in app/page.tsx; env(safe-area-inset-bottom) keeps it clear of the home
        indicator on a notched phone.
      */}
      <div className="sticky bottom-0 z-30 -mx-6 mt-10 border-t border-rule bg-canvas/95 px-6 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] backdrop-blur-sm md:static md:mx-0 md:mt-12 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-4">
          {onBack ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={onBack}
              disabled={isWorking}
              className="hidden md:inline-flex"
            >
              <ArrowLeft aria-hidden data-icon="inline-start" />
              Back
            </Button>
          ) : (
            <span className="hidden md:block" />
          )}
          <Button
            size="lg"
            onClick={onContinue}
            disabled={isWorking}
            className="h-12 w-full text-[0.9375rem] md:h-11 md:w-auto md:px-5"
          >
            {isWorking ? "Building your semester…" : "Build my semester"}
            {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Direct prerequisites the student has already cleared — left context on the chain. */
function completedPrereqsFor(
  code: string,
  prereqsOf: Record<string, string[]> | undefined,
  audit: StudentAudit,
): string[] {
  const direct = prereqsOf?.[code] ?? [];
  const taken = new Set(audit.coursesTaken);
  return direct.filter((c) => taken.has(c));
}

/**
 * The requirements nothing else is waiting on, collapsed by default.
 *
 * These cards are identical to one another and used to own the bottom half of
 * the column, directly under a headline saying not every box weighs the same —
 * the layout argued against its own copy. Collapsed, the urgent card and its
 * chain are the centre of the screen.
 *
 * Native <details> rather than React state, deliberately: keyboard operable and
 * announced as a disclosure for free, works before hydration, and there is no
 * open/closed state that can fall out of step with the data. The course codes
 * stay visible while it is closed, so nothing is hidden, only the repetition.
 *
 * "Still required, no rush" rather than "safe to delay": these courses are as
 * required as every other one on the audit. Only the timing is loose.
 */
function NoRushGroup({
  codes,
  children,
}: {
  codes: string[];
  children: ReactNode;
}) {
  if (codes.length === 0) return null;
  return (
    <details className="group mt-8">
      {/* py-1.5, not py-1: measured at 22px tall, two short of the WCAG 2.2
          SC 2.5.8 24px target minimum. */}
      <summary className="flex list-none cursor-pointer flex-col gap-2 rounded-lg py-1.5 [&::-webkit-details-marker]:hidden">
        <span className="eyebrow flex items-center gap-1.5 text-calm">
          <Check className="size-3.5" aria-hidden />
          Still required, no rush
          <span className="tabular-nums opacity-70">{codes.length}</span>
          <ChevronRight
            className="size-3.5 transition-transform group-open:rotate-90"
            aria-hidden
          />
        </span>
        <span className="flex flex-wrap items-center gap-1.5 group-open:hidden">
          {codes.map((code) => (
            <span
              key={code}
              className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
            >
              {code}
            </span>
          ))}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

function Fact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`truncate font-medium tabular-nums ${
          emphasis ? "text-critical" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
