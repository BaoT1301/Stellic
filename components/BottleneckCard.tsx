import { Check, CircleAlert, Clock, TriangleAlert } from "lucide-react";

import { PrereqChain } from "@/components/PrereqChain";
import type { Bottleneck, Term } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One requirement, with its urgency. CLAUDE.md §13: urgency drives colour, and
 * the reason string is shown verbatim because §11.1 step 4 generates it — the
 * card must never re-derive or re-word it, or the screen and the algorithm can
 * disagree in front of a registrar.
 *
 * TWO VARIANTS, one component, because the urgency semantics must not fork.
 *
 *   variant="card"  the paper record row used for the supporting requirements
 *                   in the left column of the diagnosis screen. Default, so
 *                   every existing caller is unchanged.
 *   variant="hero"  the same requirement rendered for the dark analysis band:
 *                   course code at display size, title beside it, the reason
 *                   string as the urgent accent, and the prereq chain drawn
 *                   large underneath. It paints no background of its own — the
 *                   band owns the surface.
 */

const URGENCY = {
  critical: {
    label: "Take this term",
    /** Said in full on the band, where there is room for the consequence. */
    heroLabel: "Take this term or you graduate late",
    Icon: TriangleAlert,
    bar: "bg-critical",
    chip: "bg-critical-soft text-critical",
    text: "text-critical",
    /** -soft reads as the urgent accent on ink; the solid never carries text there. */
    inkAccent: "text-critical-soft",
  },
  soon: {
    label: "Take this term or next",
    heroLabel: "Take this term or next",
    Icon: CircleAlert,
    bar: "bg-soon",
    chip: "bg-soon-soft text-soon",
    text: "text-soon",
    inkAccent: "text-soon-soft",
  },
  /**
   * "Still required", not "Safe to delay". The old label read as permission to
   * skip Operating Systems. These courses are as required as every other one on
   * the audit; the only thing that is flexible is when they get taken, and the
   * group heading on the diagnosis screen says exactly that.
   */
  flexible: {
    label: "Still required",
    heroLabel: "Still required",
    Icon: Check,
    bar: "bg-calm/40",
    chip: "bg-calm-soft text-calm",
    text: "text-calm",
    inkAccent: "text-ink-fg",
  },
} as const;

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
  /** Renders the inline SVG dependency graph. Reserve it for the hero. */
  showChain?: boolean;
  /** "card" is the paper row (default). "hero" is the dark-band treatment. */
  variant?: "card" | "hero";
  className?: string;
}

export function BottleneckCard({
  bottleneck,
  titles,
  completedPrereqs,
  showChain = false,
  variant = "card",
  className,
}: BottleneckCardProps) {
  return variant === "hero" ? (
    <HeroBottleneck
      bottleneck={bottleneck}
      titles={titles}
      completedPrereqs={completedPrereqs}
      showChain={showChain}
      className={className}
    />
  ) : (
    <PaperBottleneck
      bottleneck={bottleneck}
      titles={titles}
      completedPrereqs={completedPrereqs}
      showChain={showChain}
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The band treatment. This is the frame the demo dwells on.
 * ------------------------------------------------------------------ */

function HeroBottleneck({
  bottleneck,
  titles,
  completedPrereqs,
  showChain,
  className,
}: Omit<BottleneckCardProps, "variant">) {
  const style = URGENCY[bottleneck.urgency];
  const { Icon } = style;
  const single =
    bottleneck.termsOffered.filter((t) => t !== "summer").length <= 1;
  const withChain = showChain && bottleneck.chainDepth > 0;

  return (
    <article className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          className={cn(
            "eyebrow inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5",
            style.chip,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {style.heroLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            single ? "font-medium text-soon-soft" : "text-ink-muted",
          )}
        >
          <Clock className="size-3.5" aria-hidden />
          {offeringNote(bottleneck.termsOffered)}
        </span>
      </div>

      {/* Code and title on one baseline at desktop width: the code is the
          institutional string and gets the display size, the title says what it
          is. min-w-0 on the title or a long one blows the flex row out. */}
      <div className="mt-5 flex flex-col gap-y-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-6">
        <h3 className="data display shrink-0 text-[2.75rem] font-semibold text-ink-fg sm:text-6xl">
          {bottleneck.code}
        </h3>
        <p className="display min-w-0 text-xl text-ink-muted sm:text-3xl">
          {bottleneck.title}
        </p>
      </div>

      {/* §11.1 step 4 owns this string. Render it, never rebuild it. */}
      <p
        className={cn(
          "mt-4 text-lg leading-snug font-medium tabular-nums sm:text-xl",
          style.inkAccent,
        )}
      >
        {bottleneck.reason}
      </p>

      {withChain && (
        <div className="mt-8 border-t border-ink-rule pt-8">
          <p className="eyebrow text-ink-muted">The chain behind it</p>
          <div className="mt-5">
            <PrereqChain
              surface="ink"
              bottleneck={bottleneck}
              titles={titles}
              completedPrereqs={completedPrereqs}
            />
          </div>
        </div>
      )}

      {!withChain && bottleneck.dependents.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">Holding up</span>
          {bottleneck.dependents.map((code) => (
            <span
              key={code}
              title={titles?.[code] ?? code}
              className="data rounded-md bg-ink-2 px-2 py-1 text-sm text-ink-fg"
            >
              {code}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * The paper record row. Supporting detail, and it has to look like it.
 * ------------------------------------------------------------------ */

function PaperBottleneck({
  bottleneck,
  titles,
  completedPrereqs,
  showChain,
  className,
}: Omit<BottleneckCardProps, "variant">) {
  const style = URGENCY[bottleneck.urgency];
  const { Icon } = style;
  const single =
    bottleneck.termsOffered.filter((t) => t !== "summer").length <= 1;
  const withChain = showChain && bottleneck.chainDepth > 0;

  return (
    <article
      className={cn(
        "relative min-w-0 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/[0.08]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)}
      />

      <div className="py-3.5 pr-4 pl-5">
        {/* Code first and largest: on this column the reader is scanning course
            codes, not prose. The urgency word rides on the same line in the
            urgency colour, with its icon, so state never rests on colour. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h3 className="data text-lg font-semibold text-foreground">
              {bottleneck.code}
            </h3>
            <p className="min-w-0 text-sm text-muted-foreground">
              {bottleneck.title}
            </p>
          </div>
          <span
            className={cn(
              "eyebrow inline-flex shrink-0 items-center gap-1.5",
              style.text,
            )}
          >
            <Icon className="size-3" aria-hidden />
            {style.label}
          </span>
        </div>

        {/* §11.1 step 4 owns this string. Render it, never rebuild it. */}
        <p
          className={cn(
            "mt-1.5 text-sm leading-snug tabular-nums",
            bottleneck.urgency === "flexible"
              ? "text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {bottleneck.reason}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs",
              single ? "font-medium text-soon" : "text-muted-foreground",
            )}
          >
            <Clock className="size-3" aria-hidden />
            {offeringNote(bottleneck.termsOffered)}
          </span>

          {bottleneck.dependents.length > 0 && !withChain && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Holding up</span>
              {bottleneck.dependents.map((code) => (
                <span
                  key={code}
                  title={titles?.[code] ?? code}
                  className="data rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
                >
                  {code}
                </span>
              ))}
            </span>
          )}
        </div>

        {withChain && (
          <div className="mt-4 rounded-lg bg-canvas p-4 ring-1 ring-foreground/[0.07]">
            <PrereqChain
              bottleneck={bottleneck}
              titles={titles}
              completedPrereqs={completedPrereqs}
            />
          </div>
        )}
      </div>
    </article>
  );
}
