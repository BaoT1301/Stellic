import { cn } from "@/lib/utils";

/**
 * The week, drawn. CLAUDE.md §13 State 4 and the cart.
 *
 * Why this exists at all: §11.3 already guarantees every combo is conflict-free
 * and the card SAYS "✓ No time conflicts", but a claim in text is the one thing
 * a registrar cannot check at a glance. A grid shows it. It also fixes the §16
 * complaint that "the three option cards are self-similar" — three near-identical
 * course lists become three visibly different weeks, which is the whole point of
 * putting three cards on screen.
 *
 * Four decisions that are not cosmetic:
 *
 *  1. THE VERTICAL SCALE IS PASSED IN, NOT COMPUTED HERE. All three cards must
 *     share one `startHour`/`endHour` (see `weekBounds`). Per-card bounds would
 *     draw three grids that look directly comparable while silently using three
 *     different scales — a worse defect than not drawing them at all, because it
 *     invites a comparison it then gets wrong.
 *  2. Asynchronous sections are NEVER placed. §9.1 normalises Banner's
 *     Time="TBA" / Days="&nbsp;" to empty strings, and 221 of the 985 committed
 *     sections are async. Inventing a slot for them would be a false claim about
 *     a real CRN (§0 rule 7). They are named under the grid instead.
 *  3. aria-hidden, deliberately. Every surface that renders this grid already
 *     prints each meeting in words through `formatMeeting`, so exposing the grid
 *     too would read the same schedule twice to a screen reader. This is the
 *     opposite of PrereqChain, which carries meaning nothing else states and
 *     therefore needs its role="img" and a full text equivalent.
 *  4. Tone comes from the caller. The tones map 1:1 onto ScheduleCard's role
 *     tags (critical / muted / brand), so the block colour and the row tag cannot
 *     disagree — and the grid does not need to know how a role is derived.
 */

/** GMU meeting days, in Banner's own letters. R is Thursday. */
const DAYS: { key: string; label: string }[] = [
  { key: "M", label: "Mon" },
  { key: "T", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "R", label: "Thu" },
  { key: "F", label: "Fri" },
];

const HOUR_PX = { compact: 19, full: 40 } as const;
/** Keeps a one-course week from being drawn as a single enormous block. */
const MIN_SPAN_HOURS = 5;

export interface WeekBlock {
  code: string;
  /** Banner day letters, e.g. "TR". Empty means asynchronous — never placed. */
  days: string;
  /** 24h "13:30". Empty means asynchronous. */
  startTime: string;
  endTime: string;
  tone: "critical" | "required" | "elective";
  /**
   * Start time as the rest of the app writes it, e.g. "1:30 pm". Supplied by the
   * caller rather than formatted here: `formatTime` lives in ScheduleCard, which
   * imports this file, and importing it back would make the pair circular.
   * Without it the full grid would be the only surface printing 24h times.
   */
  label?: string;
}

const TONE = {
  // Matches ScheduleCard's ROLE_TAG. Red = the chain is waiting on it.
  critical: "bg-critical-soft text-critical ring-critical/30",
  required: "bg-muted text-foreground ring-foreground/15",
  elective: "bg-brand-soft text-brand ring-brand/25",
} as const;

/** "13:30" → 810. Null for "" (asynchronous) or anything malformed. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function placeable(block: WeekBlock): { start: number; end: number } | null {
  if (!block.days) return null;
  const start = toMinutes(block.startTime);
  const end = toMinutes(block.endTime);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/**
 * The shared vertical scale, computed ONCE from every block that will be drawn
 * across every grid on the screen. Snapped outward to the hour, then widened to
 * `MIN_SPAN_HOURS` if the day is short.
 *
 * Returns null when nothing is placeable (an all-asynchronous set), which is the
 * caller's signal to render no grid rather than an empty one.
 */
export function weekBounds(
  blocks: WeekBlock[],
): { startHour: number; endHour: number } | null {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const block of blocks) {
    const span = placeable(block);
    if (!span) continue;
    earliest = Math.min(earliest, span.start);
    latest = Math.max(latest, span.end);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return null;

  let startHour = Math.floor(earliest / 60);
  let endHour = Math.ceil(latest / 60);
  while (endHour - startHour < MIN_SPAN_HOURS) {
    if (endHour < 22) endHour++;
    else if (startHour > 0) startHour--;
    else break;
  }
  return { startHour, endHour };
}

export interface WeekGridProps {
  blocks: WeekBlock[];
  /** The shared scale from `weekBounds`. */
  startHour: number;
  endHour: number;
  variant?: "compact" | "full";
  className?: string;
}

export function WeekGrid({
  blocks,
  startHour,
  endHour,
  variant = "compact",
  className,
}: WeekGridProps) {
  const placed = blocks
    .map((block) => ({ block, span: placeable(block) }))
    .filter((row): row is { block: WeekBlock; span: { start: number; end: number } } =>
      row.span !== null,
    );
  if (placed.length === 0) return null;

  const hours = Math.max(1, endHour - startHour);
  const height = hours * HOUR_PX[variant];
  const top = startHour * 60;
  const pct = (minutes: number) => ((minutes - top) / (hours * 60)) * 100;

  return (
    // aria-hidden: see note 3 in the file header. min-w-0 keeps the five columns
    // from forcing horizontal page scroll at 390px — the failure check-mobile.ts
    // guards and the one DiagnosisScreen already hit once.
    <div aria-hidden className={cn("min-w-0", className)}>
      <div className="flex gap-px">
        {DAYS.map((day) => (
          <div key={day.key} className="min-w-0 flex-1">
            <p
              className={cn(
                "pb-1 text-center font-medium text-muted-foreground",
                variant === "compact" ? "text-[0.5625rem]" : "text-[0.6875rem]",
              )}
            >
              {variant === "compact" ? day.key : day.label}
            </p>
            <div
              className="relative overflow-hidden rounded bg-canvas ring-1 ring-foreground/[0.06]"
              style={{
                height,
                // Hour rules, as a gradient rather than 11 more DOM nodes.
                backgroundImage: `repeating-linear-gradient(to bottom, var(--rule) 0 1px, transparent 1px ${HOUR_PX[variant]}px)`,
              }}
            >
              {placed
                .filter(({ block }) => block.days.includes(day.key))
                .map(({ block, span }) => (
                  <div
                    key={`${block.code}-${day.key}`}
                    // inset-x-[1px] rather than inset-x-0 so two adjacent columns
                    // read as two columns and not one continuous band.
                    className={cn(
                      "absolute inset-x-[1px] overflow-hidden rounded-[3px] ring-1",
                      variant === "compact" ? "px-0.5" : "px-1 py-0.5",
                      TONE[block.tone],
                    )}
                    style={{
                      top: `${pct(span.start)}%`,
                      height: `${pct(span.end) - pct(span.start)}%`,
                    }}
                  >
                    <span
                      className={cn(
                        "block truncate font-mono font-semibold",
                        variant === "compact"
                          ? "text-[0.5rem] leading-[1.15]"
                          : "text-[0.6875rem] leading-tight",
                      )}
                    >
                      {block.code}
                    </span>
                    {variant === "full" && (
                      // NOT opacity-70. axe flagged exactly this as a serious
                      // WCAG 1.4.3 failure: 10px text at 70% opacity over
                      // --critical-soft measures under 4.5:1. The tone's own
                      // colour at full strength is the pair ScheduleCard's role
                      // tags already use and passes; the weight drop is what
                      // carries the hierarchy instead.
                      <span className="block truncate font-mono text-[0.625rem] leading-tight font-normal">
                        {block.label ?? block.startTime}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
