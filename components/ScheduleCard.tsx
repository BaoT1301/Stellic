import { Check, ExternalLink, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ScheduleOption, Section } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One of the three options — CLAUDE.md §13, State 4. Course rows, the stat
 * line, then the Why and Tradeoff prose the model wrote.
 *
 * Two things here are not cosmetic:
 *
 *  1. "Prereq courses completed", never "all prereqs met". PrereqRule.minGrade
 *     is extracted but unconsumable — StudentAudit.coursesTaken carries no
 *     grades — so the stronger claim is false for a student with a D. §8, §13.
 *  2. The professor link is a constructed RateMyProfessors search URL that the
 *     student's own browser follows. §5 and §11.4: we never fetch it, and we
 *     never assert a rating. The wording is "look them up", not "rated 4.2".
 */

const STRATEGY_LABEL: Record<ScheduleOption["strategy"], string> = {
  "max-coverage": "Maximum skill coverage",
  balanced: "Balanced",
  "keeps-options-open": "Keeps options open",
};

/** "13:30" → "1:30 pm". Empty string means asynchronous, handled by the caller. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || m === undefined) return hhmm;
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

/**
 * Banner writes Time="TBA" and Days="&nbsp;" for asynchronous sections, and
 * §9.1 normalises those to empty strings at parse time. Rendering has to honour
 * that or the 12h converter emits "NaN:NaN" on a schedule card.
 */
export function formatMeeting(section: Section): string {
  if (section.days === "" || section.startTime === "") {
    return "Asynchronous — no set meeting time";
  }
  return `${section.days} · ${formatTime(section.startTime)}–${formatTime(section.endTime)}`;
}

export interface ScheduleCardProps {
  option: ScheduleOption;
  /** "A", "B", "C" — position in the row, not part of the contract. */
  letter: string;
  /** Elective slots open across incomplete requirements (§11.3 step 3). */
  slotsAvailable: number;
  /** skillId → skillName, so a row can name what it closes. */
  skillNames?: Record<string, string>;
  selected?: boolean;
  onSelect: () => void;
}

export function ScheduleCard({
  option,
  letter,
  slotsAvailable,
  skillNames,
  selected = false,
  onSelect,
}: ScheduleCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card transition-shadow",
        selected
          ? "ring-2 ring-brand shadow-md"
          : "ring-1 ring-foreground/10 hover:shadow-sm",
      )}
    >
      <header className="border-b border-rule px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-muted-foreground">
            Option {letter} · {STRATEGY_LABEL[option.strategy]}
          </p>
          {selected && (
            <span className="eyebrow inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-brand">
              <Check className="size-3" aria-hidden />
              In cart
            </span>
          )}
        </div>
        <h3 className="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-balance">
          {option.label}
        </h3>
      </header>

      <ul className="divide-y divide-rule">
        {option.courses.map((course) => {
          const closes = course.skillsClosed.length;
          return (
            <li key={course.section.crn} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {course.code}
                    </span>
                    {course.isBottleneck && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-critical uppercase"
                        title="A course other requirements are waiting on"
                      >
                        <TriangleAlert className="size-2.5" aria-hidden />
                        bottleneck
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {course.title}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums"
                  title="Course reference number — what you paste into registration"
                >
                  {course.section.crn}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {formatMeeting(course.section)}
                </span>
                {course.section.modality !== "in-person" && (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {course.section.modality}
                  </span>
                )}
                {course.section.instructor && (
                  <a
                    href={course.rmpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
                    title={`Look up ${course.section.instructor} on RateMyProfessors`}
                  >
                    {course.section.instructor}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>

              {closes > 0 && (
                <p
                  className="mt-1.5 text-xs text-covered"
                  title={course.skillsClosed
                    .map((id) => skillNames?.[id] ?? id)
                    .join("\n")}
                >
                  Closes {closes} {closes === 1 ? "gap" : "gaps"}
                  {skillNames && skillNames[course.skillsClosed[0]!] ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {skillNames[course.skillsClosed[0]!]}
                      {closes > 1 ? ` +${closes - 1}` : ""}
                    </span>
                  ) : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-rule bg-canvas px-5 py-4">
        <p className="text-sm font-medium tabular-nums">
          {option.totalCredits} credits
          <span className="text-muted-foreground">
            {" · "}
            Clears {option.bottlenecksCleared}{" "}
            {option.bottlenecksCleared === 1 ? "bottleneck" : "bottlenecks"}
            {" · "}
            Closes {option.gapsClosed} of {option.gapsTotal} gaps
            {" · "}
            {option.slotsUsed} of {slotsAvailable} elective{" "}
            {slotsAvailable === 1 ? "slot" : "slots"}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {/* Never "all prereqs met" — see the note at the top of this file. */}
          <span className="inline-flex items-center gap-1 text-covered">
            <Check className="size-3" aria-hidden />
            Prereq courses completed
          </span>
          {option.conflicts.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-covered">
              <Check className="size-3" aria-hidden />
              No time conflicts
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-critical">
              <TriangleAlert className="size-3" aria-hidden />
              {option.conflicts.join("; ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <Prose label="Why" body={option.why} />
        <Prose label="Tradeoff" body={option.tradeoff} muted />
        <Button
          onClick={onSelect}
          variant={selected ? "outline" : "default"}
          size="lg"
          className="mt-auto w-full"
        >
          {selected ? "Selected" : "Take this schedule"}
        </Button>
      </div>
    </article>
  );
}

function Prose({
  label,
  body,
  muted = false,
}: {
  label: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-sm leading-relaxed text-pretty",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {body}
      </p>
    </div>
  );
}
