import { Check, ChevronDown, CircleAlert, Clock, TriangleAlert } from "lucide-react";

import { PrereqChain } from "@/components/PrereqChain";
import type { DelayImpact } from "@/lib/bottlenecks";
import type { Bottleneck, Term } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One requirement, with its urgency. CLAUDE.md §13: urgency drives colour, and
 * the reason string is shown verbatim because §11.1 step 4 generates it — the
 * card must never re-derive or re-word it, or the screen and the algorithm can
 * disagree in front of a registrar.
 *
 * The chip label is the only text that says how urgent this is, which is what
 * keeps the card off a colour-alone failure (WCAG 1.4.1). The diagnosis screen
 * therefore carries no group headings repeating it.
 */

const URGENCY = {
  critical: {
    label: "Take this term",
    Icon: TriangleAlert,
    bar: "bg-critical",
    chip: "bg-critical-soft text-critical",
    ring: "ring-critical/25",
  },
  soon: {
    label: "Take this term or next",
    Icon: CircleAlert,
    bar: "bg-soon",
    chip: "bg-soon-soft text-soon",
    ring: "ring-soon/25",
  },
  /**
   * "Still required", not "Safe to delay". The old label read as permission to
   * skip Operating Systems. These courses are as required as every other one on
   * the audit; the only thing that is flexible is when they get taken.
   */
  flexible: {
    label: "Still required",
    Icon: Check,
    bar: "bg-calm/35",
    chip: "bg-calm-soft text-calm",
    ring: "ring-foreground/10",
  },
} as const;

/**
 * Summer is never plannable (§11.1), so it is never spoken about here.
 *
 * This now returns null for the ordinary case. A course offered every fall and
 * every spring is not news, and printing "Offered fall and spring" on all five
 * cards was four words of noise per card that a student had to read past to
 * reach the one card where the offering pattern is actually the story.
 */
function offeringNote(termsOffered: Term[]): string | null {
  const plannable = termsOffered.filter((t) => t !== "summer");
  if (plannable.length === 1) return `Offered ${plannable[0]} only`;
  if (plannable.length === 0) return "No fall or spring offering on record";
  return null;
}

export interface BottleneckCardProps {
  bottleneck: Bottleneck;
  /** course code → title, for the dependent chips and the chain nodes. */
  titles?: Record<string, string>;
  /** Direct prerequisites already completed, for the chain's left-hand node. */
  completedPrereqs?: string[];
  /** Renders the inline SVG dependency graph. Reserve it for the hero card. */
  showChain?: boolean;
  /**
   * The one card the screen is about. Larger type and a heavier ring, so the
   * urgent requirement is visibly different from the ones that can wait rather
   * than differing only in colour.
   */
  hero?: boolean;
  /** §11.1's chain arithmetic, one term later. Computed in app/page.tsx. */
  delay?: DelayImpact;
  className?: string;
}

export function BottleneckCard({
  bottleneck,
  titles,
  completedPrereqs,
  showChain = false,
  hero = false,
  delay,
  className,
}: BottleneckCardProps) {
  const style = URGENCY[bottleneck.urgency];
  const { Icon } = style;
  const offering = offeringNote(bottleneck.termsOffered);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl bg-card ring-1",
        style.ring,
        hero && "ring-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0",
          hero ? "w-1" : "w-[3px]",
          style.bar,
        )}
      />

      <div className={cn("py-4 pr-5 pl-6", hero && "py-5 pr-6 pl-7")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span
            className={cn(
              "eyebrow inline-flex items-center gap-1.5 rounded-full px-2 py-1",
              style.chip,
            )}
          >
            <Icon className="size-3" aria-hidden />
            {style.label}
          </span>
          {offering && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-soon">
              <Clock className="size-3" aria-hidden />
              {offering}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3
            className={cn(
              "font-mono font-semibold tracking-tight",
              hero ? "text-2xl" : "text-lg",
            )}
          >
            {bottleneck.code}
          </h3>
          <p
            className={cn(
              "text-muted-foreground",
              hero ? "text-base" : "text-sm",
            )}
          >
            {bottleneck.title}
          </p>
        </div>

        {/* §11.1 step 4 owns this string. Render it, never rebuild it. */}
        <p
          className={cn(
            "mt-2 text-sm leading-snug",
            bottleneck.urgency === "flexible"
              ? "text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {bottleneck.reason}
        </p>

        {showChain && bottleneck.chainDepth > 0 && (
          <div className="mt-4 rounded-lg bg-canvas p-4 ring-1 ring-foreground/[0.07] sm:p-5">
            <PrereqChain
              bottleneck={bottleneck}
              titles={titles}
              completedPrereqs={completedPrereqs}
            />
          </div>
        )}

        {delay && (delay.atRisk.length > 0 || delay.beyondWindowNow.length > 0) && (
          <DelayCost bottleneck={bottleneck} delay={delay} titles={titles} />
        )}

        {bottleneck.dependents.length > 0 && !showChain && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Holding up</span>
            {bottleneck.dependents.map((code) => (
              <span
                key={code}
                title={titles?.[code] ?? code}
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
              >
                {code}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * What one term of delay costs, in this student's own courses.
 *
 * §2's whole thesis is that a missed prerequisite pushes a downstream sequence
 * back a year, and until now the product stated that as a general claim while
 * having every number needed to say it about THIS audit. `delayImpact` does the
 * arithmetic; this only renders it.
 *
 * Three rules the copy obeys:
 *  1. No graduation date is ever asserted. `expectedGraduation` is nullable and
 *     `termsRemaining` falls back to a credit-pace ESTIMATE when it is missing
 *     (lib/bottlenecks.ts), so a date here would be an invented fact on a screen
 *     full of checkable ones — §0 rule 7.
 *  2. No term is ever named. "Wait a term" is true whichever term this is.
 *  3. The last line says the assumption out loud. One course per term per chain
 *     is exactly what §11.1's urgency classification already assumes, so a
 *     registrar can check this panel against the label above it and find them
 *     consistent rather than merely adjacent.
 *
 * Native <details>: no model call, no fetch, no loading state, works before
 * hydration. "What if I wait?" rather than "What if you take it later?" — five
 * words shorter and it is the question a student actually asks.
 */
function DelayCost({
  bottleneck,
  delay,
  titles,
}: {
  bottleneck: Bottleneck;
  delay: DelayImpact;
  titles?: Record<string, string>;
}) {
  const { termsNeeded, termsAvailable, atRisk, beyondWindowNow } = delay;

  return (
    <details className="group/delay mt-3">
      {/* py-1.5 clears the WCAG 2.2 SC 2.5.8 24px target floor. */}
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
        What if I wait?
        <ChevronDown
          className="size-3 transition-transform group-open/delay:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-1 space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs leading-relaxed ring-1 ring-foreground/[0.07]">
        <p className="text-foreground">
          <span className="font-mono font-medium">{bottleneck.code}</span> and
          what is behind it need {termsNeeded}{" "}
          {termsNeeded === 1 ? "term" : "terms"}. You have {termsAvailable}.
        </p>

        {atRisk.length > 0 && (
          <Codes
            lead={`Wait a term and ${atRisk.length === 1 ? "this slips" : "these slip"}:`}
            codes={atRisk}
            titles={titles}
          />
        )}

        {/* Separate from atRisk on purpose — see DelayImpact.beyondWindowNow.
            Saying "this breaks if you delay" about a course that is already
            unreachable would be a false claim in the reassuring direction. */}
        {beyondWindowNow.length > 0 && (
          <Codes
            lead="Already out of reach:"
            codes={beyondWindowNow}
            titles={titles}
            tone="muted"
          />
        )}

        {/* The summer/overload caveat applies to every course named above, not
            just the already-unreachable ones — `termsRemaining` excludes summer
            outright (§11.1), so it is the same assumption behind both lists. */}
        <p className="text-muted-foreground">
          Counts one class per term. Summer and overloads are not counted, so
          ask your advisor.
        </p>
      </div>
    </details>
  );
}

/** A lead line plus course-code chips. The `title` attribute carries the course
 *  name so a code a student does not recognise is one hover from being readable. */
function Codes({
  lead,
  codes,
  titles,
  tone = "critical",
}: {
  lead: string;
  codes: string[];
  titles?: Record<string, string>;
  tone?: "critical" | "muted";
}) {
  return (
    <div>
      <p className="text-muted-foreground">{lead}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {codes.map((code) => (
          <span
            key={code}
            title={titles?.[code] ?? code}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono",
              tone === "critical"
                ? "bg-critical-soft text-critical"
                : "bg-muted text-foreground",
            )}
          >
            {code}
          </span>
        ))}
      </div>
    </div>
  );
}
