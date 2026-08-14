import { Check, CircleAlert, Clock, TriangleAlert } from "lucide-react";

import { PrereqChain } from "@/components/PrereqChain";
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
   * the audit; the only thing that is flexible is when they get taken, and the
   * group heading on the diagnosis screen says exactly that.
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
  className?: string;
}

export function BottleneckCard({
  bottleneck,
  titles,
  completedPrereqs,
  showChain = false,
  className,
}: BottleneckCardProps) {
  const style = URGENCY[bottleneck.urgency];
  const { Icon } = style;
  const single = bottleneck.termsOffered.filter((t) => t !== "summer").length <= 1;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl bg-card ring-1",
        style.ring,
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
              "eyebrow inline-flex items-center gap-1.5 rounded-full px-2 py-1",
              style.chip,
            )}
          >
            <Icon className="size-3" aria-hidden />
            {style.label}
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
          <h3 className="font-mono text-xl font-semibold tracking-tight">
            {bottleneck.code}
          </h3>
          <p className="text-base text-muted-foreground">{bottleneck.title}</p>
        </div>

        {/* §11.1 step 4 owns this string. Render it, never rebuild it. */}
        <p
          className={cn(
            "mt-2.5 text-[0.9375rem] leading-snug",
            bottleneck.urgency === "flexible"
              ? "text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {bottleneck.reason}
        </p>

        {showChain && bottleneck.chainDepth > 0 && (
          <div className="mt-5 rounded-lg bg-canvas p-4 ring-1 ring-foreground/[0.07]">
            <PrereqChain
              bottleneck={bottleneck}
              titles={titles}
              completedPrereqs={completedPrereqs}
            />
          </div>
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
