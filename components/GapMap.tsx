import type { ReactNode } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";

import type { SkillGap } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The gap map — CLAUDE.md §13, right column of State 3.
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

/**
 * The three numbers in the strip above, restated as one sentence that adds up.
 *
 * A registrar will do this arithmetic; being the one who did it first is worth
 * more than the number. Every count is derived from the same `gaps` array the
 * chips below are drawn from, so the sentence cannot drift from the screen.
 * "Reachable" is `closableBy.length > 0` — §11.2 step 4 only fills that field
 * with courses whose prerequisites the student has already satisfied, so an
 * empty one means the skill sits behind a prerequisite, not that no course
 * teaches it.
 */
function arithmetic(gaps: SkillGap[]): string | null {
  const total = gaps.length;
  if (total === 0) return null;

  const covered = gaps.filter((g) => g.covered).length;
  const reachable = gaps.filter(
    (g) => !g.covered && g.closableBy.length > 0,
  ).length;
  const blocked = gaps.filter(
    (g) => !g.covered && g.closableBy.length === 0,
  ).length;

  const parts = [
    `Your postings asked for ${total} ${total === 1 ? "thing" : "things"}.`,
  ];

  if (covered === 0) {
    parts.push("None of it is taught by a course you have to take anyway.");
  } else if (covered === 1) {
    parts.push(
      "You are already getting one of them from a course you have to take.",
    );
  } else {
    parts.push(
      `You are already getting ${covered} from courses you have to take.`,
    );
  }

  if (reachable === 1) {
    parts.push("One more you can reach with an elective next term.");
  } else if (reachable > 1) {
    parts.push(`${reachable} more you can reach with an elective next term.`);
  }

  if (blocked === 1) {
    parts.push("One needs a prerequisite first.");
  } else if (blocked > 1) {
    parts.push(`${blocked} need a prerequisite first.`);
  }

  return parts.join(" ");
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
  const sentence = arithmetic(gaps);

  return (
    <section className={cn("flex flex-col", className)}>
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          What the jobs asked for
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          …and whether your remaining classes already teach it. Every skill your
          postings asked for, ranked by how many of them asked.
          {postingCount ? ` Read across ${postingCount} postings.` : ""}
        </p>
        <dl className="mt-4 flex items-stretch divide-x divide-rule overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          <Stat label="Asked for" value={gaps.length} />
          <Stat label="Open" value={missing.length} tone="missing" />
          <Stat label="Covered" value={covered.length} tone="covered" />
        </dl>
        {sentence && (
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {sentence}
          </p>
        )}
      </header>

      {/* The chips below are verbatim O*NET titles (§9.3), which is why they
          read like a federal dataset and not like a job ad. Say so once, here,
          rather than letting the student assume we wrote them badly. */}
      {gaps.length > 0 && (
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          These are the U.S. Labor Department&apos;s standard names for job
          tasks. That&apos;s why they don&apos;t read like the posting.
        </p>
      )}

      <Group
        title="Nothing you have left teaches these"
        note="An elective is the only way to close these."
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
          note="You'll get these anyway. Don't spend an elective on them."
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
