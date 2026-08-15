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
import type { DelayImpact } from "@/lib/bottlenecks";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { Bottleneck, SkillGap, StudentAudit } from "@/lib/types";

/**
 * State 3 — CLAUDE.md §13. "This screen and the next are the two that sell the
 * product."
 *
 * ONE COLUMN, in reading order: what the jobs asked for, then what is holding up
 * the degree. This replaced a two-column grid that only existed at lg: — below
 * 1024px the gap map was already a full second screen of scrolling after the
 * last bottleneck card, so the layout the phone got and the layout the laptop
 * got told the story in two different orders. Now they are the same order, and
 * the demand side lands before the constraint side, which is the argument the
 * screen is actually making.
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
  /**
   * course code → what one term of delay costs it (§11.1's chain arithmetic).
   * Computed in app/page.tsx, which is the only place holding the prereq graph.
   */
  delays?: Record<string, DelayImpact>;
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

  return (
    <section className="animate-in fade-in duration-500">
      {/*
        Headline only. No step eyebrow — the Stepper directly above already says
        "Diagnosis" — and no lede. The lede here read "One requirement costs you
        a term if you miss it. 7 skills your postings asked for are still open",
        which is both numbers restated from the two stat strips below it. This is
        a tool screen, not a landing page, so it opens at 36/44px rather than the
        52px the entry screen uses.
      */}
      <header className="max-w-3xl">
        <h1 className="text-3xl text-balance sm:text-4xl">
          Not every box on your audit weighs the same.
        </h1>
      </header>

      {/* flex-col + divide-y on mobile, flex-row + divide-x above sm. Using
          flex-wrap here instead would put a stray rule on the wrapped row. */}
      <dl className="mt-8 flex flex-col divide-y divide-rule overflow-hidden rounded-xl bg-card shadow-e1 ring-1 ring-foreground/[0.06] sm:flex-row sm:divide-x sm:divide-y-0">
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

      {/* Demand first, then constraint. min-w-0 stays on both sections: they are
          full width now so a grid blowout is no longer possible, but the chip
          grid inside GapMap and the code chips inside a bottleneck card both
          rely on an ancestor that will shrink below its min-content width. */}
      <div className="mt-12 min-w-0">
        <GapMap gaps={gaps} className="min-w-0" />
      </div>

      <div className="mt-14 min-w-0">
        <h2 className="text-2xl">What&apos;s holding up your degree</h2>

        <Group
          title="Take this term or graduate late"
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
              delay={delays?.[b.code]}
              // The hero carries the prereq SVG and needs the full width; the
              // rest pair up rather than each stretching to 1200px.
              className={
                heroHasChain && b.code === hero?.code ? "md:col-span-2" : ""
              }
            />
          ))}
        </Group>

        {unofferedCritical.length > 0 && (
          <p className="mt-4 rounded-lg bg-critical-soft px-4 py-3 text-sm text-critical">
            <span className="font-semibold">
              {unofferedCritical.join(", ")}
            </span>{" "}
            {unofferedCritical.length === 1 ? "has" : "have"} no{" "}
            {NEXT_TERM_LABEL} section, so nothing we build can include{" "}
            {unofferedCritical.length === 1 ? "it" : "them"} — see your advisor.
          </p>
        )}

        <Group title="Take this term or next" tone="soon" count={soon.length}>
          {soon.map((b) => (
            <BottleneckCard
              key={b.code}
              bottleneck={b}
              titles={titles}
              completedPrereqs={completedPrereqsFor(b.code, prereqsOf, audit)}
              showChain={heroHasChain && b.code === hero?.code}
              delay={delays?.[b.code]}
              className={
                heroHasChain && b.code === hero?.code ? "md:col-span-2" : ""
              }
            />
          ))}
        </Group>

        <DelayGroup codes={flexible.map((b) => b.code)}>
          {flexible.map((b) => (
            <BottleneckCard key={b.code} bottleneck={b} titles={titles} />
          ))}
        </DelayGroup>
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
        <Button size="xl" onClick={onContinue} disabled={isWorking}>
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
      {/* Two up. These cards are full width now, and a short one — a code, a
          title and a one-line reason — stretched across 1200px is mostly empty
          card. The hero opts back out with md:col-span-2. */}
      <div className="mt-3 grid items-start gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

/** The one-line body under the summary, so the collapse never reads as "skip these". */
function delayNote(count: number): string {
  if (count === 1) {
    return "Still required. Nothing is waiting on it, so when is up to you.";
  }
  return `Still required, all ${spell(count)}. Nothing is waiting on them, so the order is yours.`;
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
          Nothing is waiting on these
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
      <p className="mt-3 text-sm text-muted-foreground">
        {delayNote(codes.length)}
      </p>
      <div className="mt-3 grid items-start gap-3 md:grid-cols-2">{children}</div>
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
