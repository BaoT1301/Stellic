import type { ReactNode } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";

import type { SkillGap } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The gap map — CLAUDE.md §13, the second half of State 3.
 *
 * "The gap map" is what the spec calls it and it stays the name in the code.
 * On screen the heading is "What the jobs asked for", because the judges are
 * registrars and the student is a first-generation senior: neither of them has
 * been taught our private vocabulary, and a heading is not the place to teach
 * it. Do not rename the file or the props to match the heading.
 *
 * IT IS A COVERAGE PICTURE, NOT A LIST OF PILLS. Every demanded skill is in one
 * of three states, and the proportions between them are the actual finding:
 *
 *   covered    a course you have to take anyway already teaches it
 *   reachable  an elective next term can close it        (closableBy non-empty)
 *   blocked    it sits behind a prerequisite you have not cleared
 *
 * So the column opens with one bar that shows those three quantities against
 * each other, and the rows underneath are a register — hairline-ruled, code
 * column on the right — rather than a bag of chips. §11.2's design note is the
 * whole point of the first state: "you're already getting this, don't waste an
 * elective on it" is a more useful message than a longer gap list.
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

type GapState = "covered" | "reachable" | "blocked";

function stateOf(gap: SkillGap): GapState {
  if (gap.covered) return "covered";
  return gap.closableBy.length > 0 ? "reachable" : "blocked";
}

/**
 * The three quantities in the bar, restated as one sentence that adds up.
 *
 * A registrar will do this arithmetic; being the one who did it first is worth
 * more than the number. Every count is derived from the same `gaps` array the
 * rows below are drawn from, so the sentence cannot drift from the screen.
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

/** The hatch that separates "blocked" from "reachable" without using colour. */
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, var(--missing) 0 3px, transparent 3px 7px)",
} as const;

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
  const reachable = missing.filter((g) => g.closableBy.length > 0).length;
  const blocked = missing.length - reachable;
  const total = sorted.length;
  const sentence = arithmetic(gaps);
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          What the jobs asked for
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          …and whether your remaining classes already teach it. Every skill your
          postings asked for, ranked by how many of them asked.
          {postingCount ? ` Read across ${postingCount} postings.` : ""}
        </p>
      </header>

      {total === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-rule px-5 py-8 text-center">
          <p className="text-sm font-medium">No skills to map yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Nothing could be read out of the postings you pasted, so there is no
            coverage picture to draw. Your requirements on the left are
            unaffected.
          </p>
        </div>
      ) : (
        <>
          {/* THE COVERAGE PICTURE. One bar, three quantities, in proportion. */}
          <div className="mt-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="data text-3xl leading-none font-semibold">
                {total}
              </span>
              <span className="text-sm text-muted-foreground">
                {total === 1 ? "skill asked for" : "skills asked for"}
                {postingCount
                  ? ` across ${postingCount} ${postingCount === 1 ? "posting" : "postings"}`
                  : ""}
              </span>
            </div>

            {/* The bar is aria-hidden: every quantity in it is stated in the
                legend directly underneath, in words and digits. */}
            <div
              aria-hidden
              className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {covered.length > 0 && (
                <div
                  className="h-full bg-covered"
                  style={{ width: `${pct(covered.length)}%` }}
                />
              )}
              {reachable > 0 && (
                <div
                  className="h-full bg-missing"
                  style={{ width: `${pct(reachable)}%` }}
                />
              )}
              {blocked > 0 && (
                <div
                  className="h-full bg-missing/25"
                  style={{ width: `${pct(blocked)}%`, ...HATCH }}
                />
              )}
            </div>

            <dl className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
              <LegendItem
                count={covered.length}
                label="already covered"
                swatch={<span className="size-2.5 rounded-[3px] bg-covered" />}
              />
              <LegendItem
                count={reachable}
                label="an elective can close"
                swatch={<span className="size-2.5 rounded-[3px] bg-missing" />}
              />
              <LegendItem
                count={blocked}
                label="behind a prerequisite"
                swatch={
                  <span
                    className="size-2.5 rounded-[3px] bg-missing/25"
                    style={HATCH}
                  />
                }
              />
            </dl>

            {sentence && (
              <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-foreground">
                {sentence}
              </p>
            )}
          </div>

          {/* The rows below are verbatim O*NET titles (§9.3), which is why they
              read like a federal dataset and not like a job ad. Say so once,
              here, rather than letting the student assume we wrote them badly. */}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            These are the U.S. Labor Department&apos;s standard names for job
            tasks. That&apos;s why they don&apos;t read like the posting.
          </p>

          <Group
            title="Nothing you have left teaches these"
            note="An elective is the only way to close these."
            count={missing.length}
            swatch="missing"
          >
            {missing.map((gap) => (
              <Row key={gap.skillId} gap={gap} postingCount={postingCount} />
            ))}
          </Group>

          <Group
            title="Already covered by courses you have to take anyway"
            note="You'll get these anyway. Don't spend an elective on them."
            count={covered.length}
            swatch="covered"
          >
            {covered.map((gap) => (
              <Row key={gap.skillId} gap={gap} postingCount={postingCount} />
            ))}
          </Group>
        </>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Skills are O*NET Detailed Work Activities, matched to course descriptions
        from the public catalog.
      </p>
    </section>
  );
}

function LegendItem({
  count,
  label,
  swatch,
}: {
  count: number;
  label: string;
  swatch: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span aria-hidden className="translate-y-[1px]">
        {swatch}
      </span>
      <dd className="data text-sm font-semibold text-foreground">{count}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

/**
 * A ruled heading rather than another bordered card: the two states are one
 * register split in two, and a rule reads as a split where a card reads as a
 * separate object.
 */
function Group({
  title,
  note,
  count,
  swatch,
  children,
}: {
  title: string;
  note: string;
  count: number;
  swatch: "missing" | "covered";
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mt-7">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-[3px]",
            swatch === "missing" ? "bg-missing" : "bg-covered",
          )}
        />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="data text-xs text-muted-foreground">{count}</span>
        <span aria-hidden className="h-px min-w-4 flex-1 bg-rule" />
      </div>
      <p className="mt-1 ml-5 text-xs text-muted-foreground">{note}</p>
      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {children}
      </ul>
    </div>
  );
}

const MARKER = {
  covered: { Icon: Check, box: "bg-covered-soft text-covered" },
  reachable: { Icon: ArrowRight, box: "bg-missing-soft text-missing" },
  blocked: { Icon: Lock, box: "bg-muted text-muted-foreground" },
} as const;

function Row({
  gap,
  postingCount,
}: {
  gap: SkillGap;
  postingCount?: number;
}) {
  const state = stateOf(gap);
  const { Icon, box } = MARKER[state];
  const detail = state === "covered" ? gap.coveredBy : gap.closableBy;

  // The one sentence that says what this row's state means. It rides on the
  // marker, so the state is announced once — never on colour alone, and never
  // twice.
  const stateText =
    state === "covered"
      ? `Covered by ${detail.join(", ")}`
      : state === "reachable"
        ? `Can be closed by ${detail.join(" or ")}`
        : "Needs a prerequisite you have not cleared yet";

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          box,
        )}
        title={
          state === "blocked"
            ? "No course you can register for next term teaches this. It sits behind a prerequisite you haven't cleared."
            : stateText
        }
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{stateText}</span>
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[0.8125rem] leading-5 text-foreground"
        title={gap.skillName}
      >
        {gap.skillName}
      </span>

      {/* Course codes are institutional strings and are set in .data. They drop
          below sm, where the marker and its screen-reader text still carry the
          state — the codes are the detail, not the meaning. */}
      {detail.length > 0 ? (
        <span
          aria-hidden
          className={cn(
            "data hidden shrink-0 text-[0.6875rem] sm:inline",
            state === "covered" ? "text-covered" : "text-missing",
          )}
        >
          {detail.slice(0, 2).join(" · ")}
          {detail.length > 2 ? ` +${detail.length - 2}` : ""}
        </span>
      ) : (
        <span
          aria-hidden
          className="hidden shrink-0 text-[0.6875rem] text-muted-foreground sm:inline"
        >
          needs a prereq first
        </span>
      )}

      {/* Demand as a fraction, so "2" always reads against the number of
          postings it was counted from. */}
      <span
        className="data w-10 shrink-0 text-right text-[0.6875rem] text-muted-foreground"
        title={`${gap.demandCount} of your postings asked for this`}
      >
        <span aria-hidden>
          {postingCount ? `${gap.demandCount}/${postingCount}` : gap.demandCount}
        </span>
        <span className="sr-only">
          {`Asked for by ${gap.demandCount} of your postings`}
        </span>
      </span>
    </li>
  );
}
