import type { ReactNode } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";

import type { SkillGap } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The gap map — CLAUDE.md §13. This is now the FIRST section of State 3, full
 * width, above the bottleneck list. It used to be the right-hand column of a
 * two-column grid that only existed at lg:, so on anything narrower it was
 * already a second screen of scrolling after every bottleneck card. One column
 * for everyone means the desktop read and the phone read are the same read.
 *
 * "The gap map" is what the spec calls it and it stays the name in the code.
 * On screen the heading is "What the jobs asked for", because the judges are
 * registrars and the student is a first-generation senior: neither of them has
 * been taught our private vocabulary, and a heading is not the place to teach
 * it. Do not rename the file or the props to match the heading.
 *
 * Two colours: already covered by courses she is taking anyway, versus open.
 * §11.2's design note is the whole point of the first colour — "you're already
 * getting this, don't waste an elective on it" is a more useful message than a
 * longer gap list, and it is carried by the group heading itself rather than by
 * a caption underneath it.
 *
 * skillName is a verbatim O*NET 20.1 DWA title. §9.3: truncate with CSS
 * ellipsis, NEVER by editing the string — keeping them verbatim is what keeps
 * us inside CC BY 4.0 without triggering the "indicate changes" clause. Hence
 * `truncate` plus a title attribute, and never `.slice()`.
 */

export interface GapMapProps {
  gaps: SkillGap[];
  className?: string;
}

export function GapMap({ gaps, className }: GapMapProps) {
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
      <h2 className="text-2xl">What the jobs asked for</h2>

      {/*
        The strip IS the summary. There used to be a sentence directly beneath it
        restating the same two numbers in words ("5 already covered by courses
        you have to take · 3 reachable with an elective · 2 behind prereqs"),
        plus a caption above it explaining the sort order. Both are gone: three
        numbers at 30px do not need a paragraph telling you what they are, the
        chips below are visibly in descending count order, and every state the
        sentence described is already a badge on the chip that has it.
      */}
      <dl className="mt-5 flex items-stretch divide-x divide-rule overflow-hidden rounded-xl bg-card shadow-e1 ring-1 ring-foreground/[0.06] sm:max-w-md">
        <Stat label="Asked for" value={gaps.length} />
        <Stat label="Open" value={missing.length} tone="missing" />
        <Stat label="Covered" value={covered.length} tone="covered" />
      </dl>

      <Group
        title="Nothing you have left teaches these"
        count={missing.length}
        tone="missing"
      >
        {missing.map((gap) => (
          <Chip key={gap.skillId} gap={gap} tone="missing" />
        ))}
      </Group>

      {covered.length > 0 && (
        <Group
          title="Already covered by courses you have to take"
          count={covered.length}
          tone="covered"
        >
          {covered.map((gap) => (
            <Chip key={gap.skillId} gap={gap} tone="covered" />
          ))}
        </Group>
      )}

      {/* The DWA titles are rendered verbatim (§9.3), so naming O*NET here is
          the CC BY 4.0 attribution — not a caption, and not removable. */}
      <p className="mt-6 text-xs text-muted-foreground">
        O*NET Detailed Work Activities — U.S. Labor Department names, matched to
        public catalog descriptions. That&apos;s why they don&apos;t read like
        the posting.
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
    <div className="flex-1 px-5 py-4">
      <dd
        className={cn(
          "text-2xl leading-none font-bold tabular-nums",
          tone === "missing" && "text-missing",
          tone === "covered" && "text-covered",
        )}
      >
        {value}
      </dd>
      <dt className="eyebrow mt-2 text-muted-foreground">{label}</dt>
    </div>
  );
}

/**
 * At full width the chips flow in columns instead of stacking. A fifteen-gap
 * list was a fifteen-row tower when this lived in a 0.9fr column; two across, it
 * is the shape of the thing it describes — a set, not a queue.
 *
 * TWO columns and not three. Three fits, and it truncated the DWA titles down to
 * "Analyze data to inf…" — a set of chips nobody can read is worse than a taller
 * list, and §9.3 forbids shortening these strings by editing them, so the column
 * has to be wide enough for CSS to do it honestly.
 */
function Group({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "missing" | "covered";
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 translate-y-[-1px] rounded-full",
            tone === "missing" ? "bg-missing" : "bg-covered",
          )}
        />
        <h3 className="text-base">{title}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">{children}</ul>
    </div>
  );
}

function Chip({ gap, tone }: { gap: SkillGap; tone: "missing" | "covered" }) {
  const detail = tone === "covered" ? gap.coveredBy : gap.closableBy;
  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-full border py-1.5 pr-2 pl-3.5",
        tone === "missing"
          ? "border-missing/25 bg-missing-soft"
          : "border-covered/25 bg-covered-soft",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm leading-5",
          tone === "missing" ? "text-foreground" : "text-covered",
        )}
        title={gap.skillName}
      >
        {gap.skillName}
      </span>

      {/* The badge stays at every breakpoint and only the course codes drop
          below sm. It used to be `hidden … sm:inline-flex`, which left the two
          states of this list separated by chip colour alone on a small screen —
          the WCAG 1.4.1 failure, and the one thing on this column a colour-blind
          registrar could not read. The icon and the screen-reader text carry the
          state; the codes are the detail. */}
      {detail.length > 0 ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs",
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
          <span className="sr-only">
            {tone === "covered"
              ? `Covered by ${detail.join(", ")}`
              : `Can be closed by ${detail.join(" or ")}`}
          </span>
          <span aria-hidden className="hidden sm:inline">
            {detail.slice(0, 2).join(", ")}
            {detail.length > 2 ? ` +${detail.length - 2}` : ""}
          </span>
        </span>
      ) : (
        tone === "missing" && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground"
            title="No course you can register for next term teaches this — it sits behind a prerequisite you haven't cleared."
          >
            <Lock className="size-2.5" aria-hidden />
            <span className="sr-only">
              Needs a prerequisite you have not cleared yet
            </span>
            <span aria-hidden className="hidden sm:inline">
              needs a prereq first
            </span>
          </span>
        )
      )}

      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
          tone === "missing"
            ? "bg-missing text-white"
            : "bg-covered text-white",
        )}
        title={`${gap.demandCount} of your postings asked for this`}
      >
        <span aria-hidden>{gap.demandCount}</span>
        <span className="sr-only">
          {`Asked for by ${gap.demandCount} of your postings`}
        </span>
      </span>
    </li>
  );
}
