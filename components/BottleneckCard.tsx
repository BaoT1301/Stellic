import { Check, ChevronDown, CircleAlert, Clock, Lock, TriangleAlert } from "lucide-react";

import { PrereqChain } from "@/components/PrereqChain";
import type { DelayImpact } from "@/lib/bottlenecks";
import type { Bottleneck, Term } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One requirement, with its urgency. CLAUDE.md §13: urgency drives colour, and
 * the reason string is shown verbatim because §11.1 step 4 generates it — the
 * card must never re-derive or re-word it, or the screen and the algorithm can
 * disagree in front of a registrar.
 */

const URGENCY = {
  critical: {
    label: "Take this term",
    Icon: TriangleAlert,
    bar: "bg-critical",
    chip: "bg-critical-soft text-critical",
    border: "border-critical/30",
  },
  soon: {
    label: "Take this term or next",
    Icon: CircleAlert,
    bar: "bg-soon",
    chip: "bg-soon-soft text-soon",
    border: "border-soon/30",
  },
  /**
   * "Still required", not "Safe to delay". The old label read as permission to
   * skip Operating Systems. These courses are as required as every other one on
   * the audit; the only thing that is flexible is when they get taken, and the
   * group heading on the diagnosis screen says exactly that.
   */
  flexible: {
    label: "Still required",
    Icon: Check,
    bar: "bg-calm/35",
    chip: "bg-calm-soft text-calm",
    border: "border-rule",
  },
} as const;

/**
 * The chip, for a course the student cannot register for yet.
 *
 * `URGENCY[urgency].label` is an instruction — "Take this term" — and it was
 * being read unconditionally. For CS 367, whose prerequisite CS 262 is still
 * unmet, that offered a term that does not exist. When `blockedBy` is non-empty
 * the chip names the blocker instead, generated from the prereq graph at
 * runtime; §13 forbids hardcoding any of this copy.
 *
 * `termsUntilEligible === 1` is the common, actionable case and gets the
 * sharpest sentence: clear the blocker this term, take this one next.
 */
function blockedLabel(blockedBy: string[], termsUntilEligible: number): string {
  const names = blockedBy.join(" and ");
  return termsUntilEligible === 1 ? `Next term, after ${names}` : `After ${names}`;
}

/**
 * Summer is never plannable (§11.1), so it is never spoken about here. A course
 * offered in exactly one plannable term is the offering half of the urgency
 * story and gets said out loud; anything else is quiet.
 */
function offeringNote(termsOffered: Term[]): string {
  const plannable = termsOffered.filter((t) => t !== "summer");
  if (plannable.length === 1) {
    return `Offered ${plannable[0]} only`;
  }
  if (plannable.length === 0) {
    return "No fall or spring offering on record";
  }
  return "Offered fall and spring";
}

export interface BottleneckCardProps {
  bottleneck: Bottleneck;
  /** course code → title, for the dependent chips and the chain nodes. */
  titles?: Record<string, string>;
  /** Direct prerequisites already completed, for the chain's left-hand node. */
  completedPrereqs?: string[];
  /** Renders the inline SVG dependency graph. Reserve it for the hero card. */
  showChain?: boolean;
  /** §11.1's chain arithmetic, one term later. Computed in app/page.tsx. */
  delay?: DelayImpact;
  className?: string;
}

export function BottleneckCard({
  bottleneck,
  titles,
  completedPrereqs,
  showChain = false,
  delay,
  className,
}: BottleneckCardProps) {
  const style = URGENCY[bottleneck.urgency];
  const single = bottleneck.termsOffered.filter((t) => t !== "summer").length <= 1;

  // Blocked overrides the chip only. `style.bar` and `style.ring` stay on
  // urgency, so a blocked-critical course still reads red — it IS critical; it
  // just is not something she can do next term.
  const isBlocked = bottleneck.blockedBy.length > 0;
  const Icon = isBlocked ? Lock : style.Icon;
  const chipLabel = isBlocked
    ? blockedLabel(bottleneck.blockedBy, bottleneck.termsUntilEligible)
    : style.label;
  const chipClass = isBlocked ? "bg-muted text-foreground" : style.chip;

  // The hero — the one card carrying the prereq chain — used to be lifted a
  // drop-shadow level above the rest. It no longer needs to be: it is the only
  // card on the screen carrying an SVG, it spans both columns, and it is first.
  // Depth was the least of the four things marking it.
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-md border bg-card",
        style.border,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)}
      />

      <div className={cn("py-4 pr-5 pl-6", showChain && "pb-5")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span
            className={cn(
              "eyebrow inline-flex items-center gap-1.5 rounded-sm px-2 py-1",
              chipClass,
            )}
          >
            <Icon className="size-3" aria-hidden />
            {chipLabel}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs",
              single ? "font-medium text-soon" : "text-muted-foreground",
            )}
          >
            <Clock className="size-3" aria-hidden />
            {offeringNote(bottleneck.termsOffered)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* No font-weight utility: @layer base sets h1-h3 to 700, and this
              should match the course code on a schedule card. */}
          <h3 className="text-xl">{bottleneck.code}</h3>
          <p className="text-base text-muted-foreground">{bottleneck.title}</p>
        </div>

        {/* §11.1 step 4 owns this string. Render it, never rebuild it. */}
        <p
          className={cn(
            "mt-2.5 text-base leading-snug",
            bottleneck.urgency === "flexible"
              ? "text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {bottleneck.reason}
        </p>

        {showChain && bottleneck.chainDepth > 0 && (
          <div className="mt-5 rounded-sm border border-rule bg-canvas p-4">
            <PrereqChain
              bottleneck={bottleneck}
              titles={titles}
              completedPrereqs={completedPrereqs}
            />
          </div>
        )}

        {/* termsNeeded > termsAvailable is the third trigger. CS 471 has no
            dependents, so both lists are empty, yet it needs three terms against
            her two — and this panel is the only surface that says so. */}
        {delay &&
          (delay.atRisk.length > 0 ||
            delay.beyondWindowNow.length > 0 ||
            delay.termsNeeded > delay.termsAvailable) && (
            <DelayCost bottleneck={bottleneck} delay={delay} titles={titles} />
          )}

        {bottleneck.dependents.length > 0 && !showChain && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Holding up</span>
            {bottleneck.dependents.map((code) => (
              <span
                key={code}
                title={titles?.[code] ?? code}
                className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
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
 *  2. No term is ever named. "One term later" is true whichever term this is.
 *  3. The last line says the assumption out loud. One course per term per chain
 *     is exactly what §11.1's urgency classification already assumes, so a
 *     registrar can check this panel against the label above it and find them
 *     consistent rather than merely adjacent.
 *
 * Native <details>, like WhyThis in ScheduleCard: no model call, no fetch, no
 * loading state, and it works before hydration.
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
  const { termsNeeded, termsAvailable, termsUntilEligible, atRisk, beyondWindowNow } =
    delay;
  const blockedBy = bottleneck.blockedBy;

  return (
    <details className="group/delay mt-3">
      {/* py-1.5 clears the WCAG 2.2 SC 2.5.8 24px target floor, the same reason
          DelayGroup's summary in DiagnosisScreen carries it. */}
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
        What if you take it later?
        <ChevronDown
          className="size-3 transition-transform group-open/delay:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-1 space-y-2 rounded-sm border border-rule bg-canvas px-3 py-2.5 text-xs">
        {/* "Taken next term" was asserted unconditionally, which is false for a
            course with an unmet prerequisite — the soonest it can be taken is
            termsUntilEligible terms out. Both branches state the same
            arithmetic; only the earliest term differs. */}
        <p className="text-foreground">
          {termsUntilEligible > 0 && blockedBy.length > 0 ? (
            <>
              You cannot take{" "}
              <span className="font-mono font-medium">{bottleneck.code}</span>{" "}
              until {blockedBy.join(" and ")}{" "}
              {blockedBy.length === 1 ? "is" : "are"} done, so it and the chain
              behind it need {termsNeeded} {termsNeeded === 1 ? "term" : "terms"}.
              You have {termsAvailable}.
            </>
          ) : (
            <>
              Taken next term,{" "}
              <span className="font-mono font-medium">{bottleneck.code}</span> and
              the chain behind it need {termsNeeded}{" "}
              {termsNeeded === 1 ? "term" : "terms"}. You have {termsAvailable}.
            </>
          )}
        </p>

        {atRisk.length > 0 && (
          <Codes
            lead={`One term later, ${atRisk.length === 1 ? "this no longer fits" : "these no longer fit"}:`}
            codes={atRisk}
            titles={titles}
          />
        )}

        {/* Separate from atRisk on purpose — see DelayImpact.beyondWindowNow.
            Saying "this breaks if you delay" about a course that is already
            unreachable would be a false claim in the reassuring direction. */}
        {beyondWindowNow.length > 0 && (
          <Codes
            // "even if you take it next term" is itself a false premise for a
            // blocked course — next term is not available to it.
            lead={`Already past your last ${termsAvailable === 1 ? "term" : `${termsAvailable} terms`} even ${termsUntilEligible > 0 ? "at the soonest you could take it" : "if you take it next term"}:`}
            codes={beyondWindowNow}
            titles={titles}
            tone="muted"
          />
        )}

        {/* The summer/overload caveat applies to every course named above, not
            just the already-unreachable ones — `termsRemaining` excludes summer
            outright (§11.1), so it is the same assumption behind both lists. */}
        <p className="text-muted-foreground">
          Counted one course per term along the chain — the same arithmetic behind
          the label on this card. Summer terms and overloads are not counted; your
          advisor can tell you whether either is open to you.
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
              "rounded-sm px-1.5 py-0.5 font-mono",
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
