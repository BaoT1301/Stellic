"use client";

import type { ReactNode } from "react";
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

/**
 * State 3 — CLAUDE.md §13. Two columns: what is load-bearing, and the gap map.
 * "This screen and the next are the two that sell the product."
 *
 * Every string on this screen comes from §11.1's output at runtime. §13 is
 * explicit that its own example is ILLUSTRATIVE ONLY and that nothing here may
 * be hardcoded — so the counts, the headings and the hero selection are all
 * derived from the props below.
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
  const flexible = bottlenecks.filter((b) => b.urgency === "flexible");

  // The hero is the deepest critical course — the one whose chain is worth
  // drawing. Falls back to the deepest "soon" so the SVG never disappears just
  // because a student happens to be in good shape.
  const hero =
    [...critical, ...soon].sort((a, b) => b.chainDepth - a.chainDepth)[0] ?? null;
  const heroHasChain = hero !== null && hero.chainDepth > 0;

  const termsRemaining = bottlenecks[0]?.termsRemaining;
  const graduation = formatGraduation(audit.expectedGraduation);
  const openGaps = gaps.filter((g) => !g.covered).length;

  return (
    <section className="animate-in fade-in duration-500">
      <header className="max-w-3xl">
        <p className="eyebrow text-brand">Step 3 · the diagnosis</p>
        <h1 className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Not every box on your audit weighs the same.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
          {critical.length > 0 ? (
            <>
              {critical.length === 1 ? "One" : critical.length} of your remaining
              requirements{" "}
              {critical.length === 1 ? "sits" : "sit"} at the head of a chain and
              cost{critical.length === 1 ? "s" : ""} you a term for every one you
              miss. {openGaps} of the skills your postings asked for are still
              open.
            </>
          ) : (
            <>
              Nothing you have left is on the critical path — your sequencing is
              clean. {openGaps} of the skills your postings asked for are still
              open, and that is where your electives go.
            </>
          )}
        </p>
      </header>

      {/* flex-col + divide-y on mobile, flex-row + divide-x above sm. Using
          flex-wrap here instead would put a stray rule on the wrapped row. */}
      <dl className="mt-8 flex flex-col divide-y divide-rule overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:flex-row sm:divide-x sm:divide-y-0">
        <Fact label="Program" value={audit.major} />
        <Fact
          label="Credits"
          value={`${audit.creditsCompleted} of ${audit.creditsRequired}`}
        />
        <Fact label="Graduating" value={graduation ?? "not on file"} />
        {termsRemaining !== undefined && (
          <Fact
            label="Terms left"
            value={`${termsRemaining} ${termsRemaining === 1 ? "term" : "terms"}`}
            emphasis={termsRemaining <= 2}
          />
        )}
        {/* Catalog year decides which requirement set is even valid, so it is
            the first thing a registrar looks for. It is parsed (§8) and was
            being rendered nowhere. */}
        <Fact label="Catalog" value={audit.catalogYear ?? "not on file"} />
      </dl>

      {/*
        min-w-0 on BOTH children is load-bearing, not tidiness. The
        minmax(0,...) that prevents grid blowout only applies at lg:; below that
        the implicit single column is `auto` and a grid item's default
        `min-width: auto` refuses to shrink below its content's min-content
        width. Measured at 390px before this fix: the column rendered 596px wide
        and the page scrolled sideways to 620px, which also pushed a gap chip on
        top of the "Build my semester" button so it could not be tapped.
      */}
      <div className="mt-10 grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            What&apos;s holding up the rest of your degree
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Ordered by how much of your remaining degree is waiting behind each
            one. These are the load-bearing ones.
          </p>

          <Group
            title="Take this term or you graduate late"
            tone="critical"
            count={critical.length}
          >
            {critical.map((b) => (
              <BottleneckCard
                key={b.code}
                bottleneck={b}
                titles={titles}
                completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
                showChain={heroHasChain && b.code === hero?.code}
              />
            ))}
          </Group>

          {unofferedCritical.length > 0 && (
            <p className="mt-4 rounded-lg bg-critical-soft px-4 py-3 text-sm leading-relaxed text-critical">
              <span className="font-mono font-medium">
                {unofferedCritical.join(", ")}
              </span>{" "}
              {unofferedCritical.length === 1 ? "is" : "are"} on your critical
              path but {unofferedCritical.length === 1 ? "has" : "have"} no{" "}
              {NEXT_TERM_LABEL} section. Nothing we build can include{" "}
              {unofferedCritical.length === 1 ? "it" : "them"} — see your advisor.
            </p>
          )}

          <Group
            title="Take this term or next"
            tone="soon"
            count={soon.length}
          >
            {soon.map((b) => (
              <BottleneckCard
                key={b.code}
                bottleneck={b}
                titles={titles}
                completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
                showChain={heroHasChain && b.code === hero?.code}
              />
            ))}
          </Group>

          <DelayGroup codes={flexible.map((b) => b.code)}>
            {flexible.map((b) => (
              <BottleneckCard key={b.code} bottleneck={b} titles={titles} />
            ))}
          </DelayGroup>
        </div>

        <GapMap gaps={gaps} postingCount={postingCount} className="min-w-0" />
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
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
      <h3 className={`eyebrow flex items-center gap-1.5 ${text}`}>
        <Icon className="size-3.5" aria-hidden />
        {title}
        <span className="tabular-nums opacity-70">{count}</span>
      </h3>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
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
 * was the least urgent thing on the audit. Collapsed, the critical card and its
 * prereq chain become the centre of the screen and the gap map moves into the
 * same viewport.
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
        <span className={`eyebrow flex items-center gap-1.5 ${text}`}>
          <Icon className="size-3.5" aria-hidden />
          Still required - but nothing is waiting on them
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
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {delayNote(codes.length)}
      </p>
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
    <div className="min-w-0 flex-1 px-5 py-4">
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1.5 truncate text-sm font-medium tabular-nums ${
          emphasis ? "text-critical" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
