"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  TriangleAlert,
} from "lucide-react";

import { BottleneckCard } from "@/components/BottleneckCard";
import { GapMap } from "@/components/GapMap";
import { Button } from "@/components/ui/button";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Bottleneck, SkillGap, StudentAudit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * State 3 — CLAUDE.md §13. "This screen and the next are the two that sell the
 * product."
 *
 * THE SHAPE OF THIS SCREEN IS THE ARGUMENT.
 *
 * The input screens are paper: you type on paper. The analysis is INK — a
 * full-bleed dark band that carries the student's record, the one requirement
 * that costs them a term, and the prerequisite chain behind it at full size.
 * Nothing else in the product looks like that band, which is the point: the
 * moment the diagnosis appears you can see, before reading a word, that the
 * machine has stopped collecting and started answering.
 *
 * Everything under the band is paper again and is explicitly supporting detail:
 * the requirements that are not the headline, and the coverage picture.
 *
 * Every string on this screen comes from §11.1's output at runtime. §13 is
 * explicit that its own example is ILLUSTRATIVE ONLY and that nothing here may
 * be hardcoded — so the counts, the headings and the hero selection are all
 * derived from the props below.
 */

/**
 * FULL BLEED, without ever creating a horizontal scrollbar.
 *
 * The band lives inside the page's `max-w-6xl px-6` column, so it has to break
 * out of that gutter. The usual `w-screen` / `50vw` trick is wrong here: 100vw
 * INCLUDES the classic scrollbar, so on desktop it overflows the body by half a
 * scrollbar on each side and the whole page scrolls sideways — the exact failure
 * this project has already been bitten by once.
 *
 * Instead the bleed is derived from the element's own containing block: `100%`
 * in a margin resolves against the containing block's inline size, so
 * `(100vw - 100% - 3rem) / 2` is the free space beside the page column whatever
 * `max-w-*` the page uses, `- 1rem` absorbs the scrollbar over-estimate, and
 * `max(0px, …)` collapses the whole term on phones, where the answer is simply
 * "cancel the 1.5rem gutter". At 390px this is edge to edge; at 1440px it stops
 * ~16px short of the viewport edge, which is invisible and cannot overflow.
 */
const BLEED: CSSProperties = {
  marginInline: "calc(-1.5rem - max(0px, (100vw - 100% - 3rem) / 2 - 1rem))",
};

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

/** Small counts read better spelled out mid-sentence; digits take over past ten. */
const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function spell(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

export interface DiagnosisScreenProps {
  audit: StudentAudit;
  bottlenecks: Bottleneck[];
  gaps: SkillGap[];
  /** course code → title, for dependent chips and chain nodes. */
  titles?: Record<string, string>;
  /** course code → its direct prerequisites, for the chain's left-hand node. */
  prereqsOf?: Record<string, string[]>;
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
  postingCount,
  unofferedCritical = [],
  onContinue,
  onBack,
  isWorking = false,
}: DiagnosisScreenProps) {
  const critical = bottlenecks.filter((b) => b.urgency === "critical");
  const soon = bottlenecks.filter((b) => b.urgency === "soon");

  // The hero is the deepest critical course — the one whose chain is worth
  // drawing at full size on the band. Falls back to the deepest "soon" so the
  // band never empties out just because a student happens to be in good shape.
  const hero =
    [...critical, ...soon].sort((a, b) => b.chainDepth - a.chainDepth)[0] ?? null;
  const heroHasChain = hero !== null && hero.chainDepth > 0;

  // Everything the band did not take is supporting detail on paper below it.
  const rest = bottlenecks.filter((b) => b.code !== hero?.code);
  const restCritical = rest.filter((b) => b.urgency === "critical");
  const restSoon = rest.filter((b) => b.urgency === "soon");
  const flexible = rest.filter((b) => b.urgency === "flexible");

  const termsRemaining = bottlenecks[0]?.termsRemaining;
  const graduation = formatGraduation(audit.expectedGraduation);
  const openGaps = gaps.filter((g) => !g.covered).length;

  return (
    <section className="animate-in fade-in duration-500">
      {/* MASTHEAD. Headline left, deck right, on one baseline — deliberately not
          the stacked eyebrow/headline/paragraph of the input screens. */}
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-12">
        <div className="min-w-0">
          <p className="eyebrow text-brand">Step 3 · the diagnosis</p>
          <h1 className="display mt-4 text-4xl font-semibold sm:text-5xl">
            Not every box on your audit weighs the same.
          </h1>
        </div>
        <p className="text-base leading-relaxed text-muted-foreground text-pretty lg:pb-1.5">
          {critical.length > 0 ? (
            <>
              {critical.length === 1 ? "One" : critical.length} of your remaining
              requirements {critical.length === 1 ? "sits" : "sit"} at the head
              of a chain and cost{critical.length === 1 ? "s" : ""} you a term
              for every one you miss. {openGaps} of the skills your postings
              asked for are still open.
            </>
          ) : (
            <>
              Nothing you have left is on the critical path, so your sequencing
              is clean. {openGaps} of the skills your postings asked for are
              still open, and that is where your electives go.
            </>
          )}
        </p>
      </header>

      {/* ------------------------------------------------------------------ *
       * THE INK BAND. Record, verdict, chain.
       * ------------------------------------------------------------------ */}
      <div className="ink-band mt-10 sm:mt-12" style={BLEED}>
        <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
          {/* The student's record, as an instrument readout. Catalog year
              decides which requirement set is even valid, so it is the first
              thing a registrar looks for and it is on the band with the rest. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-ink-rule pb-7 sm:grid-cols-3 lg:grid-cols-5">
            <Fact label="Program" value={audit.major} />
            <Fact
              label="Credits"
              value={`${audit.creditsCompleted} of ${audit.creditsRequired}`}
              mono
            />
            <Fact label="Graduating" value={graduation ?? "not on file"} mono />
            {termsRemaining !== undefined && (
              <Fact
                label="Terms left"
                value={`${termsRemaining} ${termsRemaining === 1 ? "term" : "terms"}`}
                mono
                emphasis={termsRemaining <= 2}
              />
            )}
            <Fact label="Catalog" value={audit.catalogYear ?? "not on file"} mono />
          </dl>

          <div className="mt-9">
            {hero ? (
              <BottleneckCard
                variant="hero"
                bottleneck={hero}
                titles={titles}
                completedPrereqs={completedPrereqsFor(hero.code, prereqsOf, audit)}
                showChain={heroHasChain}
              />
            ) : (
              /* A real empty state, not a blank band: a clean audit is a
                 finding, and it is the one the student most wants to hear. */
              <div className="max-w-2xl">
                <p className="eyebrow inline-flex items-center gap-1.5 rounded-full bg-calm-soft px-2.5 py-1.5 text-calm">
                  <Check className="size-3.5" aria-hidden />
                  Nothing is blocking anything
                </p>
                <p className="display mt-5 text-3xl font-semibold text-ink-fg sm:text-4xl">
                  No requirement you have left is holding another one up.
                </p>
                <p className="mt-4 text-base leading-relaxed text-ink-muted">
                  Your sequencing is clean, so the order you take the rest in is
                  yours to choose. The decision still open is what you do with
                  your electives, and that is the coverage picture below.
                </p>
              </div>
            )}
          </div>

          {unofferedCritical.length > 0 && (
            <div className="mt-8 flex items-start gap-3 rounded-lg bg-ink-2 px-4 py-3.5 ring-1 ring-critical-soft/25">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-critical-soft"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-ink-fg">
                <span className="data font-medium text-critical-soft">
                  {unofferedCritical.join(", ")}
                </span>{" "}
                {unofferedCritical.length === 1 ? "is" : "are"} on your critical
                path but {unofferedCritical.length === 1 ? "has" : "have"} no{" "}
                <span className="data">{NEXT_TERM_LABEL}</span> section. Nothing
                we build can include{" "}
                {unofferedCritical.length === 1 ? "it" : "them"}. See your
                advisor.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ *
       * Back on paper: the supporting detail, in two columns.
       *
       * min-w-0 on BOTH children is load-bearing, not tidiness. The
       * minmax(0,...) that prevents grid blowout only applies at lg:; below that
       * the implicit single column is `auto` and a grid item's default
       * `min-width: auto` refuses to shrink below its content's min-content
       * width. Measured at 390px before this fix: the column rendered 596px wide
       * and the page scrolled sideways to 620px, which also pushed a gap chip on
       * top of the "Build my semester" button so it could not be tapped.
       * ------------------------------------------------------------------ */}
      <div className="mt-14 grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            The rest of what you still owe
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Ordered by how much of your remaining degree is waiting behind each
            one. Nothing here is optional; the difference is when it has to
            happen.
          </p>

          <Group
            title={
              hero?.urgency === "critical"
                ? "Also on the critical path"
                : "Take this term or you graduate late"
            }
            tone="critical"
            count={restCritical.length}
          >
            {restCritical.map((b) => (
              <BottleneckCard
                key={b.code}
                bottleneck={b}
                titles={titles}
                completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
              />
            ))}
          </Group>

          <Group title="Take this term or next" tone="soon" count={restSoon.length}>
            {restSoon.map((b) => (
              <BottleneckCard
                key={b.code}
                bottleneck={b}
                titles={titles}
                completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
              />
            ))}
          </Group>

          <DelayGroup codes={flexible.map((b) => b.code)}>
            {flexible.map((b) => (
              <BottleneckCard key={b.code} bottleneck={b} titles={titles} />
            ))}
          </DelayGroup>

          {rest.length === 0 && (
            <p className="mt-6 rounded-xl border border-dashed border-rule px-5 py-6 text-sm leading-relaxed text-muted-foreground">
              {hero
                ? "That is the only named requirement you have left. Whatever elective slots you still owe are a free choice, which is what the coverage picture is for."
                : "There are no named requirements left on your audit to sequence."}
            </p>
          )}
        </div>

        <GapMap gaps={gaps} postingCount={postingCount} className="min-w-0" />
      </div>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        {onBack ? (
          <Button variant="ghost" size="lg" onClick={onBack} disabled={isWorking}>
            <ArrowLeft aria-hidden data-icon="inline-start" />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="lg"
          onClick={onContinue}
          disabled={isWorking}
          className="h-11 px-5 text-[0.9375rem]"
        >
          {isWorking ? "Building your semester…" : "Build my semester"}
          {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
        </Button>
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

const GROUP_TONE = {
  critical: { Icon: TriangleAlert, text: "text-critical" },
  soon: { Icon: CircleAlert, text: "text-soon" },
  flexible: { Icon: Check, text: "text-calm" },
} as const;

/** A ruled heading, matching the register in the gap map column beside it. */
function Group({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: keyof typeof GROUP_TONE;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  const { Icon, text } = GROUP_TONE[tone];
  return (
    <div className="mt-8">
      <h3 className={cn("eyebrow flex items-center gap-2", text)}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {title}
        <span className="data text-xs opacity-70">{count}</span>
        <span aria-hidden className="h-px min-w-4 flex-1 bg-rule" />
      </h3>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

/** The one-line body under the summary, so the collapse never reads as "skip these". */
function delayNote(count: number): string {
  if (count === 1) {
    return "You still have to take it. Nothing else is waiting on it, so when you take it is up to you.";
  }
  return `You still have to take all ${spell(count)}. None of them blocks anything else, so the order is yours.`;
}

/**
 * The requirements nothing else is waiting on, collapsed by default.
 *
 * These cards are identical to one another and owned the bottom half of this
 * column, directly under a headline that says not every box weighs the same —
 * the layout argued against its own copy, and the loudest thing on the screen
 * was the least urgent thing on the audit. Collapsed, the band above and the
 * coverage picture beside it stay the centre of the screen.
 *
 * Native <details> rather than React state, deliberately: it is keyboard
 * operable and announced as a disclosure for free, it works before hydration,
 * and there is no open/closed state that can fall out of step with the data.
 * The course codes stay visible while it is closed, so nothing is hidden —
 * only the repetition is.
 */
function DelayGroup({
  codes,
  children,
}: {
  codes: string[];
  children: ReactNode;
}) {
  if (codes.length === 0) return null;
  const { Icon, text } = GROUP_TONE.flexible;
  return (
    <details className="group mt-8">
      {/* py-1.5, not py-1: measured at 22px tall, two short of the WCAG 2.2
          SC 2.5.8 24px target minimum. */}
      <summary className="flex list-none cursor-pointer flex-col gap-2 rounded-lg py-1.5 [&::-webkit-details-marker]:hidden">
        <span className={cn("eyebrow flex items-center gap-2", text)}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          Still required - but nothing is waiting on them
          <span className="data text-xs opacity-70">{codes.length}</span>
          <ChevronRight
            className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <span aria-hidden className="h-px min-w-4 flex-1 bg-rule" />
        </span>
        <span className="flex flex-wrap items-center gap-1.5 group-open:hidden">
          {codes.map((code) => (
            <span
              key={code}
              className="data rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
            >
              {code}
            </span>
          ))}
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {delayNote(codes.length)}
      </p>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </details>
  );
}

/** One cell of the record rail on the ink band. */
function Fact({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  /** Institutional numbers — credits, terms, catalog years — are set in .data. */
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "mt-2 truncate text-[0.9375rem] font-medium",
          mono && "data",
          emphasis ? "text-critical-soft" : "text-ink-fg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
