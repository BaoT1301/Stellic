import type { ReactNode } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";

import type { SkillGap } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The gap map — CLAUDE.md §13, right column of State 3.
 *
 * Two colours: already covered by courses she is taking anyway, versus open.
 * §11.2's design note is the whole point of the first colour — "you're already
 * getting this, don't waste an elective on it" is a more useful message than a
 * longer gap list.
 *
 * skillName is a verbatim O*NET 20.1 DWA title. §9.3: truncate with CSS
 * ellipsis, NEVER by editing the string — keeping them verbatim is what keeps
 * us inside CC BY 4.0 without triggering the "indicate changes" clause. Hence
 * `truncate` plus a title attribute, and never `.slice()`.
 */

export interface GapMapProps {
  gaps: SkillGap[];
  /** How many postings were pasted, for the "n of 3 asked for it" reading. */
  postingCount?: number;
  className?: string;
}

export function GapMap({ gaps, postingCount, className }: GapMapProps) {
  // §11.2 step 5 already sorts covered asc then demandCount desc. Re-sorting
  // here costs nothing and means the column is right even if a caller hands us
  // an unsorted array.
  const sorted = [...gaps].sort(
    (a, b) =>
      Number(a.covered) - Number(b.covered) || b.demandCount - a.demandCount,
  );
  const missing = sorted.filter((g) => !g.covered);
  const covered = sorted.filter((g) => g.covered);

  return (
    <section className={cn("flex flex-col", className)}>
      <header>
        <h2 className="text-lg font-semibold tracking-tight">The gap map</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Every skill your postings asked for, ranked by how many of them asked.
          {postingCount ? ` Read across ${postingCount} postings.` : ""}
        </p>
        <dl className="mt-4 flex items-stretch divide-x divide-rule overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          <Stat label="Asked for" value={gaps.length} />
          <Stat label="Open" value={missing.length} tone="missing" />
          <Stat label="Covered" value={covered.length} tone="covered" />
        </dl>
      </header>

      <Group
        title="Nothing you're taking closes these"
        note="An elective is the only lever you have left on this list."
        count={missing.length}
        tone="missing"
      >
        {missing.map((gap) => (
          <Chip key={gap.skillId} gap={gap} tone="missing" />
        ))}
      </Group>

      {covered.length > 0 && (
        <Group
          title="Already covered by courses you have to take anyway"
          note="Don't spend an elective slot on these."
          count={covered.length}
          tone="covered"
        >
          {covered.map((gap) => (
            <Chip key={gap.skillId} gap={gap} tone="covered" />
          ))}
        </Group>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Skills are O*NET Detailed Work Activities, matched to course descriptions
        from the public catalog.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "missing" | "covered";
}) {
  return (
    <div className="flex-1 px-4 py-3">
      <dd
        className={cn(
          "text-2xl leading-none font-semibold tabular-nums",
          tone === "missing" && "text-missing",
          tone === "covered" && "text-covered",
        )}
      >
        {value}
      </dd>
      <dt className="eyebrow mt-1.5 text-muted-foreground">{label}</dt>
    </div>
  );
}

function Group({
  title,
  note,
  count,
  tone,
  children,
}: {
  title: string;
  note: string;
  count: number;
  tone: "missing" | "covered";
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mt-7">
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 translate-y-[-1px] rounded-full",
            tone === "missing" ? "bg-missing" : "bg-covered",
          )}
        />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <p className="mt-1 ml-4 text-xs text-muted-foreground">{note}</p>
      <ul className="mt-3 flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function Chip({ gap, tone }: { gap: SkillGap; tone: "missing" | "covered" }) {
  const detail = tone === "covered" ? gap.coveredBy : gap.closableBy;
  return (
    <li
      className={cn(
        "flex max-w-full items-center gap-2.5 rounded-full border py-1.5 pr-2 pl-3.5",
        tone === "missing"
          ? "border-missing/25 bg-missing-soft"
          : "border-covered/25 bg-covered-soft",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.8125rem] leading-5",
          tone === "missing" ? "text-foreground" : "text-covered",
        )}
        title={gap.skillName}
      >
        {gap.skillName}
      </span>

      {detail.length > 0 ? (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] sm:inline-flex",
            tone === "missing"
              ? "bg-card text-missing"
              : "bg-card/70 text-covered",
          )}
          title={
            tone === "covered"
              ? `Covered by ${detail.join(", ")}`
              : `Closed by ${detail.join(" or ")}`
          }
        >
          {tone === "missing" ? (
            <ArrowRight className="size-2.5" aria-hidden />
          ) : (
            <Check className="size-2.5" aria-hidden />
          )}
          {detail.slice(0, 2).join(" · ")}
          {detail.length > 2 ? ` +${detail.length - 2}` : ""}
        </span>
      ) : (
        tone === "missing" && (
          <span
            className="hidden shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[0.6875rem] text-muted-foreground sm:inline-flex"
            title="No course you can register for next term teaches this — it sits behind a prerequisite you haven't cleared."
          >
            <Lock className="size-2.5" aria-hidden />
            blocked
          </span>
        )
      )}

      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums",
          tone === "missing"
            ? "bg-missing text-white"
            : "bg-covered text-white",
        )}
        title={`${gap.demandCount} of your postings asked for this`}
      >
        {gap.demandCount}
      </span>
    </li>
  );
}
