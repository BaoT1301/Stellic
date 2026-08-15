"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Lock,
  TriangleAlert,
} from "lucide-react";

import { BottleneckCard } from "@/components/BottleneckCard";
import { GapMap } from "@/components/GapMap";
import { Button } from "@/components/ui/button";
import type { DelayImpact } from "@/lib/bottlenecks";
import type { Ineligibility } from "@/lib/schedules";
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
   * Critical bottlenecks that cannot reach a schedule card, each with the
   * eligibility filter that turned it down. §11.3 step 2 requires these to
   * appear here as "see your advisor" and NEVER on a card.
   */
  ineligibleCritical?: Ineligibility[];
  /**
   * The student uploaded their own file, it could not be read, and everything
   * on this screen is therefore computed from the sample student instead.
   * §12 forbids a "showing cached sample results" badge, and app/page.tsx sets
   * this on exactly ONE of the three entry points — see the note on
   * `handleFile` there for why this case is the carve-out.
   */
  auditIsFixture?: boolean;
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
  ineligibleCritical = [],
  auditIsFixture = false,
  onContinue,
  onBack,
  isWorking = false,
}: DiagnosisScreenProps) {
  // Partition on ACTIONABILITY first, then urgency. Urgency alone put CS 367
  // under "Take this term or next" while its own prerequisite CS 262 was unmet —
  // a heading offering a term that does not exist for that course. `urgency`
  // keeps the three frozen values (§8); this is a display split, not a fourth
  // one. A blocked course is still ranked by urgency inside its own group,
  // because `computeBottlenecks` sorts globally and `filter` preserves order.
  const actionable = bottlenecks.filter((b) => b.blockedBy.length === 0);
  const critical = actionable.filter((b) => b.urgency === "critical");
  const soon = actionable.filter((b) => b.urgency === "soon");
  const blocked = bottlenecks.filter(
    (b) => b.blockedBy.length > 0 && b.urgency !== "flexible",
  );
  const flexible = bottlenecks.filter(
    (b) => b.blockedBy.length === 0 && b.urgency === "flexible",
  );

  // The hero is the deepest critical course — the one whose chain is worth
  // drawing. Falls back to the deepest "soon" so the SVG never disappears just
  // because a student happens to be in good shape.
  //
  // ACTIONABLE first: the chain's head node says TAKE THIS TERM, so heading it
  // with a course she cannot register for is the same false claim in a second
  // place. But a student whose every remaining course is blocked has no
  // actionable row at all, and dropping the chain entirely is the wrong answer
  // for exactly the student who most needs to see the sequence — so blocked
  // rows are the fallback, and PrereqChain draws the blocker as its head.
  const deepestFirst = (a: Bottleneck, b: Bottleneck) => b.chainDepth - a.chainDepth;
  const hero =
    [...critical, ...soon].sort(deepestFirst)[0] ??
    [...blocked].sort(deepestFirst)[0] ??
    null;
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
      {/* See the copy rule in JobPostingInput. The old headline — "Not every box
          on your audit weighs the same." — was the best line of the four and
          still the wrong thing at 36px on a screen whose whole job is to show
          you which boxes those are. It belongs in the write-up (§16 lists it),
          not above the data that proves it. */}
      <header className="max-w-3xl">
        <h1 className="text-3xl text-balance sm:text-4xl">
          Your {NEXT_TERM_LABEL} diagnosis
        </h1>
      </header>

      {/*
        Everything below this line describes a different student. It has to say
        so before the student reads a single number, which is why it sits above
        the facts strip rather than in a corner of it.

        Deliberately not a red banner and not a toast: this is not an alarm and
        it is not transient — the sample is still a working demonstration of the
        product, and the student can carry on through it if they want to. It is
        also deliberately silent about the CAUSE. The route degrades on a
        missing key, a scanned PDF with no text layer, a refusal, a timeout and
        a malformed model response, and the client cannot tell those apart; §0
        rule 7 is exactly the habit of not guessing which one it was.
      */}
      {auditIsFixture && (
        <p
          role="status"
          className="mt-6 rounded-sm border border-soon/25 bg-soon-soft px-4 py-3 text-sm text-soon"
        >
          We could not read your file, so this is our sample student&apos;s
          audit — not yours. The numbers below are real, but they are not about
          you. Go back and try the manual form for your own.
        </p>
      )}

      {/* flex-col + divide-y on mobile, flex-row + divide-x above sm. Using
          flex-wrap here instead would put a stray rule on the wrapped row. */}
      <dl className="mt-8 flex flex-col divide-y divide-rule overflow-hidden rounded-md border border-rule bg-card sm:flex-row sm:divide-x sm:divide-y-0">
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

        {ineligibleCritical.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-sm border border-critical/25 bg-critical-soft px-4 py-3 text-sm text-critical">
            {ineligibleCritical.map((entry) => (
              <li key={entry.code}>
                <span className="font-mono font-semibold">{entry.code}</span>{" "}
                {ineligibilityCopy(entry, audit.major)}
              </li>
            ))}
          </ul>
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

        {/*
          Third, after everything she can act on. These courses are as urgent as
          the ones above — several are `critical` — but urgency is not an
          instruction when the course cannot be registered for, so they sit below
          the two groups that CAN be acted on next term. Each card names the
          course that unblocks it, and that course is in one of the groups above.
        */}
        <Group
          title="Can't take yet, clear the prerequisite first"
          tone="blocked"
          count={blocked.length}
        >
          {blocked.map((b) => (
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

/**
 * Direct prerequisites the student has already cleared — left context on the
 * chain. Only consulted when `Bottleneck.blockedBy` is empty: an UNMET
 * prerequisite is the more important left-hand node, and PrereqChain prefers it.
 */
function completedPrereqsFor(
  code: string,
  prereqsOf: Record<string, string[]> | undefined,
  audit: StudentAudit,
): string[] {
  const direct = prereqsOf?.[code] ?? [];
  const taken = new Set(audit.coursesTaken);
  return direct.filter((c) => taken.has(c));
}

/** "CS 262" · "CS 262 and CS 310" · "CS 262, CS 310 and CS 367". */
function joinCodes(codes: string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/**
 * Why this critical course cannot reach a schedule card — the actual filter that
 * rejected it, not one plausible cause standing in for six.
 *
 * The banner used to print "has no {term} section" over the whole list.
 * `getEligibleCourses` drops a course on any of six tests and returns only
 * survivors, so that sentence was a guess, and for a major-restricted course it
 * was a guess a registrar disproves from Patriot Web in 30 seconds — CS 330 has
 * three live Fall 2026 CRNs (§0 rule 7). Every branch below is generated from
 * `lib/schedules.ts`'s own verdict plus the parsed audit; no course code, title
 * or offering claim is written into this file (§13).
 */
function ineligibilityCopy(entry: Ineligibility, major: string): string {
  const cannotInclude = `so nothing we build can include it — see your advisor.`;
  switch (entry.reason) {
    case "no-section":
      return `has no ${NEXT_TERM_LABEL} section, ${cannotInclude}`;
    case "graduate-level":
      return `is a graduate course, ${cannotInclude}`;
    case "unmet-coreq":
      return `must be taken alongside ${joinCodes(entry.blockers)}, which ${
        entry.blockers.length === 1 ? "is" : "are"
      } not available to you next term — see your advisor.`;
    // A false NEGATIVE, not a hard exclusion: `majorAllows` matches the catalog's
    // restriction prose against a free-text major string, so "CS" fails where
    // "Computer Science" passes. Asserting she cannot take it would trade one
    // false claim for another, so this branch points at the advisor and leaves
    // the question open.
    case "major-restricted":
      return `restricts enrollment by major and we could not match yours${
        major.trim() ? ` (“${major.trim()}”)` : ""
      }. It may still be open to you — confirm with your advisor.`;
    // The two below cannot be reached from this screen: app/page.tsx passes the
    // default preferences and filters out anything with a `blockedBy` (the
    // "Can't take yet" group explains those). They exist so that a list entry can
    // never render without a sentence.
    case "preferences":
      return `has no ${NEXT_TERM_LABEL} section matching your current preferences.`;
    case "unmet-prereq":
      return `needs ${joinCodes(entry.blockers)} first.`;
  }
}

const GROUP_TONE = {
  critical: { Icon: TriangleAlert, text: "text-critical" },
  soon: { Icon: CircleAlert, text: "text-soon" },
  // Muted on purpose, and no new palette token — a queue is not an alarm, and the
  // cards inside keep their own urgency bar and ring, so a blocked-critical
  // course still reads red at the card level.
  blocked: { Icon: Lock, text: "text-muted-foreground" },
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
              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
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
