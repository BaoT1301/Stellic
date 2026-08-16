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
 * Two colours: already covered by a course she has taken or still must take,
 * versus open.
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
      <dl className="mt-5 flex items-stretch divide-x divide-rule overflow-hidden rounded-md border border-rule bg-card sm:max-w-md">
        <Stat label="Asked for" value={gaps.length} />
        <Stat label="Open" value={missing.length} tone="missing" />
        <Stat label="Covered" value={covered.length} tone="covered" />
      </dl>

      {/*
        Both headings name BOTH halves of `lockedIn`, and they have to.
        §11.2 step 2 covers a skill from `taken ∪ stillRequired` (lib/gaps.ts:129),
        but these read "nothing you have left" and "courses you have to take" —
        the still-required half only. Two problems with that:

          - The missing heading was ambiguous in the alarming direction. "Nothing
            you have left" reads as "nothing available to you", when most of
            these chips carry a `closableBy` badge naming an elective that WOULD
            teach the skill. That group is the actionable one; it is the point of
            the screen.
          - The covered heading was checkably FALSE. On the sample student two of
            fifteen skills are covered only by MATH 125 and CS 110, both already
            completed — courses she does not "have to take". §0 rule 7.
      */}
      <Group
        title="Nothing you've taken or still need teaches these"
        count={missing.length}
        tone="missing"
      >
        {missing.map((gap) => (
          <Chip key={gap.skillId} gap={gap} tone="missing" />
        ))}
      </Group>

      {covered.length > 0 && (
        <Group
          title="Already covered by courses you've taken or still need"
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
 * At full width the rows flow in columns instead of stacking. A fifteen-gap list
 * was a fifteen-row tower when this lived in a 0.9fr column; two across, it is
 * the shape of the thing it describes — a set, not a queue.
 *
 * TWO columns and not three. Three fits, and it truncated the DWA titles down to
 * "Analyze data to inf…" — a set nobody can read is worse than a taller list,
 * and §9.3 forbids shortening these strings by editing them, so the column has
 * to be wide enough for CSS to do it honestly.
 *
 * The rules are per-cell borders, NOT `gap-px` over a tinted container. The
 * gap-px trick draws the same table one class shorter and then paints an empty
 * grey block into the unfilled cell whenever a group has an odd number of rows
 * — which is most of them, and it looked like a rendering fault. The container
 * is --card, so an unfilled cell is simply invisible.
 *
 * Hence the two nth-child rules: every cell takes a top border except the ones
 * in the first visual row, which is child 1 stacked and children 1-2 at lg.
 * Two columns of ruled rows is the layout a course-demand report has had since
 * long before it was on a screen.
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
            "size-2 shrink-0 translate-y-[-1px]",
            tone === "missing" ? "bg-missing" : "bg-covered",
          )}
        />
        <h3 className="text-base">{title}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <ul className="mt-3 grid overflow-hidden rounded-md border border-rule bg-card lg:grid-cols-2">
        {children}
      </ul>
    </div>
  );
}

/**
 * One demanded skill, as a ruled table row.
 *
 * This was a `rounded-full` pill on a pastel fill, with a filled circular
 * counter on the end — fifteen of them wrapping in a two-column cloud. That
 * shape is the single most recognisable component of a generated UI, and it was
 * also doing the data a disservice: a pill says "tag, one of many, unordered",
 * where this list is sorted by how many of the student's postings asked for the
 * skill and the count is the whole point.
 *
 * The two states now separate on a 2px left edge and the text colour rather than
 * on a wash of background tint. Colour still is not carrying the distinction
 * alone — the badge, its icon and its screen-reader text do that (WCAG 1.4.1),
 * which is why the badge stays at every breakpoint.
 */
function Chip({ gap, tone }: { gap: SkillGap; tone: "missing" | "covered" }) {
  const detail = tone === "covered" ? gap.coveredBy : gap.closableBy;
  return (
    <li
      className={cn(
        // Per-side colours, never the `border-rule` shorthand: it would set all
        // four sides and put the urgency colour's fate at the mercy of
        // stylesheet order against `border-l-*`.
        "flex min-w-0 items-center gap-2.5 border-t border-t-rule py-2 pr-2.5 pl-3",
        "border-l-2 first:border-t-0 lg:odd:border-r lg:odd:border-r-rule",
        "lg:[&:nth-child(2)]:border-t-0",
        tone === "missing" ? "border-l-missing" : "border-l-covered",
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
            // bg-muted, not bg-card: these used to sit on a tinted pill and are
            // now on the card itself, where a card-coloured fill is invisible.
            "inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-2 py-0.5 font-mono text-xs",
            tone === "missing" ? "text-missing" : "text-covered",
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
            className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
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
          "flex size-5 shrink-0 items-center justify-center rounded-sm text-xs font-semibold tabular-nums",
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
