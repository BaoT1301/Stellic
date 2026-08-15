import { ArrowRight, Check, ChevronDown, Lock } from "lucide-react";

import type { SkillGap } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The gap map — CLAUDE.md §13, right column of State 3.
 *
 * "The gap map" is what the spec calls it and it stays the name in the code.
 * On screen the heading names the student's own postings, because the judges
 * are registrars and the student is a first-generation senior: neither of them
 * has been taught our private vocabulary, and a heading is not the place to
 * teach it. Do not rename the file or the props to match the heading.
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
 *
 * What changed in the density pass: the 32-word sentence that restated the
 * stat tiles is gone, and the tiles went from three to four so every
 * denominator survives as a NUMBER instead of prose. Each list shows the few
 * that matter with the rest behind one disclosure — a phone was rendering ten
 * long federal job-task titles in a single column.
 */

/**
 * How many chips each list shows before the disclosure.
 *
 * The open list gets more room than the covered list on purpose: open skills
 * are the ones an elective can act on, and the covered list exists to say "stop
 * thinking about these", which one glance and a count already do.
 */
const VISIBLE_OPEN = 5;
const VISIBLE_COVERED = 3;

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

  // "Reachable" is closableBy.length > 0 — §11.2 step 4 only fills that field
  // with courses whose prerequisites the student has already satisfied, so an
  // empty one means the skill sits behind a class she has not taken, not that
  // no course teaches it. Both counts are honest denominators and both stay.
  const open = missing.filter((g) => g.closableBy.length > 0).length;
  const blocked = missing.length - open;

  return (
    <section className={cn("flex flex-col", className)}>
      <header>
        {/* Names the student's own input rather than "the jobs" in the
            abstract, and it is the only place postingCount is still spent now
            that the "read across N postings" sentence is gone. */}
        <h2 className="text-lg font-semibold tracking-tight">
          {postingCount === 1
            ? "What your posting asked for"
            : postingCount
              ? `What your ${postingCount} postings asked for`
              : "What the jobs asked for"}
        </h2>

        <dl className="mt-4 grid grid-cols-4 divide-x divide-rule overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          <Stat label="Asked" value={gaps.length} />
          <Stat label="Covered" value={covered.length} tone="covered" />
          <Stat label="Open" value={open} tone="missing" />
          <Stat label="Blocked" value={blocked} />
        </dl>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Open: an elective can cover it. Blocked: another class comes first.
        </p>

        {/* The chips below are verbatim O*NET titles (§9.3), which is why they
            read like a federal dataset and not like a job ad. The explanation
            is one toggle away rather than a paragraph everyone reads once. */}
        {gaps.length > 0 && (
          <details className="group/onet mt-1">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
              Why do these read strangely?
              <ChevronDown
                className="size-3 transition-transform group-open/onet:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              These are the U.S. Labor Department&apos;s standard names for job
              tasks. That&apos;s why they don&apos;t read like the posting.
            </p>
          </details>
        )}
      </header>

      <Group
        title="Nothing you have left teaches these"
        note="An elective is how you get these."
        tone="missing"
        gaps={missing}
        visible={VISIBLE_OPEN}
      />

      <Group
        title="You're already getting these"
        note="Don't spend an elective on them."
        tone="covered"
        gaps={covered}
        visible={VISIBLE_COVERED}
      />

      {/* O*NET attribution. This is a licence condition (§9.3), not decoration:
          it is kept verbatim and it is never collapsed. */}
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
    <div className="min-w-0 px-2.5 py-3 sm:px-4">
      <dd
        className={cn(
          "text-2xl leading-none font-semibold tabular-nums",
          tone === "missing" && "text-missing",
          tone === "covered" && "text-covered",
        )}
      >
        {value}
      </dd>
      <dt className="eyebrow mt-1.5 truncate text-muted-foreground">{label}</dt>
    </div>
  );
}

/**
 * A titled chip list, capped, with the remainder behind one native <details>.
 *
 * Progressive disclosure rather than deletion: every skill the postings asked
 * for is still on the page and still verbatim, but a student sees the handful
 * that matter first instead of scrolling past ten federal job-task titles.
 */
function Group({
  title,
  note,
  tone,
  gaps,
  visible,
}: {
  title: string;
  note: string;
  tone: "missing" | "covered";
  gaps: SkillGap[];
  visible: number;
}) {
  if (gaps.length === 0) return null;
  const head = gaps.slice(0, visible);
  const tail = gaps.slice(visible);

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
          {gaps.length}
        </span>
      </div>
      <p className="mt-1 ml-4 text-xs text-muted-foreground">{note}</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {head.map((gap) => (
          <Chip key={gap.skillId} gap={gap} tone={tone} />
        ))}
      </ul>

      {tail.length > 0 && (
        <details className="group/more mt-1.5">
          {/* py-1.5 clears the WCAG 2.2 SC 2.5.8 24px target floor. */}
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
            {`Show ${tail.length} more`}
            <ChevronDown
              className="size-3 transition-transform group-open/more:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {tail.map((gap) => (
              <Chip key={gap.skillId} gap={gap} tone={tone} />
            ))}
          </ul>
        </details>
      )}
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

      {/* The badge stays at every breakpoint and only the course codes drop
          below sm. It used to be `hidden … sm:inline-flex`, which left the two
          states of this list separated by chip colour alone on a small screen —
          the WCAG 1.4.1 failure, and the one thing on this column a colour-blind
          registrar could not read. The icon and the screen-reader text carry the
          state; the codes are the detail. */}
      {detail.length > 0 ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.6875rem]",
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
            {detail.slice(0, 2).join(" · ")}
            {detail.length > 2 ? ` +${detail.length - 2}` : ""}
          </span>
        </span>
      ) : (
        tone === "missing" && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[0.6875rem] text-muted-foreground"
            title="No class you can take next term teaches this. It sits behind a class you have not taken yet."
          >
            <Lock className="size-2.5" aria-hidden />
            <span className="sr-only">Needs another class first</span>
            <span aria-hidden className="hidden sm:inline">
              another class first
            </span>
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
        <span aria-hidden>{gap.demandCount}</span>
        <span className="sr-only">
          {`Asked for by ${gap.demandCount} of your postings`}
        </span>
      </span>
    </li>
  );
}
