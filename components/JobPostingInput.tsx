"use client";

import { useState } from "react";
import { ArrowRight, Check, Plus, Sparkles, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * State 1 — CLAUDE.md §13. Paste a job posting you'd want in two years, plus a
 * sample-fill button.
 *
 * ---------------------------------------------------------------------------
 * REDESIGN NOTES (this screen was three identical bordered boxes in a row).
 *
 * 1. ONE primary textarea, two quiet optional ones behind an "add another"
 *    affordance. The old grid rendered three equal-weight boxes ALL labelled
 *    "Optional" while the continue button required at least one — the layout
 *    contradicted the validation. Slot 1 now says Required, because it is.
 *
 * 2. The outcome is SHOWN, not described. A student pasting a job ad has no
 *    idea what comes back, so the right column carries a static ink-surface
 *    mock of a finished schedule card with real Fall 2026 CRNs. It converts
 *    "why am I pasting a job ad" into "oh, that is what I get" before they
 *    type. It is inert and labelled Preview so it can never be mistaken for
 *    live output.
 *
 * 3. Asymmetric split rather than a centred column of prose: headline and
 *    input at 7/12, the outcome at 5/12, collapsing to one column at 390px.
 *    On mobile the preview deliberately sits ABOVE the textarea — the motive
 *    has to arrive before the work does.
 * ---------------------------------------------------------------------------
 */

const SLOT_HINTS = [
  "Paste the whole posting here.",
  "A second posting, if you are weighing two directions.",
  "A third, to hedge the ranking across all of them.",
];

/**
 * The preview card. §0 rule 7: every course code, title, CRN and meeting time
 * below was read out of the committed data/courses.json, which was scraped from
 * the live Banner 8 schedule of classes for term 202670. CS 262 is the real hero
 * bottleneck from the real prereq graph (§13: chainDepth 2, holding up CS 367
 * and CS 471). CS 330 uses CRN 77906 rather than 77905 on purpose — 77905 meets
 * TR 09:00 and would collide with CS 262, and a preview showing a time conflict
 * would be a false claim about our own conflict checker.
 *
 * The skill string is verbatim from data/catalog-skills.json for CS 484, which
 * is O*NET 20.1 DWA text and must stay verbatim under CC BY 4.0 (§9.3).
 */
const PREVIEW_ROWS = [
  {
    code: "CS 262",
    title: "Introduction to Low-Level Programming",
    crn: "79379",
    meets: "TR 09:00–10:15",
    bottleneck: true,
  },
  {
    code: "CS 330",
    title: "Formal Methods and Models",
    crn: "77906",
    meets: "TR 13:30–14:45",
    bottleneck: false,
  },
  {
    code: "CS 484",
    title: "Data Mining",
    crn: "79434",
    meets: "F 10:30–13:10",
    bottleneck: false,
  },
];

function wordCount(text: string) {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

export interface JobPostingInputProps {
  /** Always length 3. Empty strings are allowed; at least one must be filled. */
  postings: string[];
  onChange: (index: number, value: string) => void;
  onLoadSamples: () => void;
  onSubmit: () => void;
  isWorking?: boolean;
}

export function JobPostingInput({
  postings,
  onChange,
  onLoadSamples,
  onSubmit,
  isWorking = false,
}: JobPostingInputProps) {
  const filled = postings.filter((p) => p.trim() !== "").length;
  const canContinue = filled > 0 && !isWorking;

  /**
   * How many slots are on screen. Derived, not just stored: "Load sample
   * postings" fills two slots at once through the caller's onChange, and the
   * caller does not know this state exists, so the highest filled index has to
   * be able to open its own slot.
   */
  const [revealed, setRevealed] = useState(1);
  const lastFilled = postings.reduce(
    (acc, p, i) => (p.trim() !== "" ? i + 1 : acc),
    0,
  );
  const visible = Math.min(3, Math.max(1, revealed, lastFilled));

  /** Closes a slot and shifts the ones below it up, so slot 2 is never blank
   *  above a filled slot 3. onChange fires only for indices that really moved. */
  function removeSlot(index: number) {
    const next = postings.filter((_, j) => j !== index);
    while (next.length < 3) next.push("");
    next.forEach((value, j) => {
      if (value !== (postings[j] ?? "")) onChange(j, value);
    });
    setRevealed(Math.max(1, visible - 1));
  }

  return (
    <section className="animate-in fade-in duration-500">
      <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-12 xl:gap-x-14">
        {/* ---------------------------------------------------------------- *
         * Row 1, left: the pitch and the one button a judge will press.
         * ---------------------------------------------------------------- */}
        <header className="min-w-0 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <p className="eyebrow flex items-center gap-2.5 text-muted-foreground">
            <span className="data text-foreground">01</span>
            <span aria-hidden className="h-px w-7 bg-foreground/25" />
            The job you want
          </p>

          <h1 className="display mt-5 text-[2.625rem] font-semibold sm:text-[3.25rem]">
            Paste the job you want in two years.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Not the one you can get today. We read what these postings actually
            ask for, match it against what your remaining requirements already
            teach you, and work backwards into next term&rsquo;s course list.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              size="lg"
              onClick={onLoadSamples}
              disabled={isWorking}
              className="h-11 px-5 text-[0.9375rem]"
            >
              <Sparkles aria-hidden />
              Load sample postings
            </Button>
            {/* "Three" was false — SAMPLE_POSTING_URLS in app/page.tsx has two,
                and the toast already says "Two sample postings loaded". */}
            <p className="max-w-[19rem] text-sm leading-snug text-muted-foreground">
              Two real early-career listings. Fastest way to see the whole
              thing.
            </p>
          </div>
        </header>

        {/* ---------------------------------------------------------------- *
         * Right column, spanning both rows on desktop. On mobile it lands
         * between the pitch and the textarea, which is where it does the most
         * work: it answers "what am I pasting this FOR" before the paste.
         * ---------------------------------------------------------------- */}
        <aside className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-24">
            <OutcomePreview />

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground text-pretty">
              You get three Fall 2026 schedules built from real sections, with
              the actual CRNs you paste into registration. The card above is a
              sample, not your schedule.
            </p>

            {/* Provenance, in the first two seconds. Every number is committed
                data, so every number is set in mono. */}
            <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-muted-foreground">
              <span className="data text-foreground">689</span> courses ·{" "}
              <span className="data text-foreground">985</span> Fall 2026
              sections · <span className="data text-foreground">270</span>{" "}
              prerequisite rules. George Mason University public catalog and
              schedule of classes.
            </p>
          </div>
        </aside>

        {/* ---------------------------------------------------------------- *
         * Row 2, left: the actual work. One dominant field, two quiet ones.
         * ---------------------------------------------------------------- */}
        <div className="min-w-0 lg:col-span-7 lg:col-start-1 lg:row-start-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-sm font-semibold">Your postings</h2>
            <p className="text-xs text-muted-foreground">
              <span className="data text-foreground">{filled}</span> of{" "}
              <span className="data">3</span> added
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {Array.from({ length: visible }, (_, i) => (
              <PostingSlot
                key={i}
                index={i}
                value={postings[i] ?? ""}
                hint={SLOT_HINTS[i] ?? ""}
                primary={i === 0}
                disabled={isWorking}
                onChange={(value) => onChange(i, value)}
                onRemove={i === 0 ? undefined : () => removeSlot(i)}
              />
            ))}
          </div>

          {visible < 3 && (
            <button
              type="button"
              onClick={() => setRevealed(visible + 1)}
              disabled={isWorking}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/20 px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden />
              Add another posting
              {/* Not /80. --muted-foreground is tuned to sit just over the
                  4.5:1 AA floor, so any opacity on top of it drops below —
                  axe measured this exact span as a serious contrast failure. */}
              <span className="text-muted-foreground">(optional)</span>
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ *
       * The commit bar. Full width under both columns so it reads as the end
       * of the step rather than the end of a card.
       * ------------------------------------------------------------------ */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        <p id="postings-status" className="text-sm text-muted-foreground">
          {filled === 0
            ? "Add one posting to continue. Two or three sharpen the ranking."
            : filled === 1
              ? "One posting added. A second one sharpens the ranking."
              : `${filled} postings added.`}
        </p>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!canContinue}
          aria-describedby="postings-status"
          className="h-11 px-5 text-[0.9375rem]"
        >
          {isWorking ? "Reading the postings…" : "Next: your audit"}
          {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PostingSlot({
  index,
  value,
  hint,
  primary,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  value: string;
  hint: string;
  primary: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const words = wordCount(value);
  const label = `Posting ${index + 1}`;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl bg-card transition-shadow",
        primary
          ? "shadow-sm ring-1 ring-foreground/15"
          : "ring-1 ring-foreground/10",
        words > 0 && "shadow-sm ring-foreground/25",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="eyebrow text-foreground">{label}</span>
          <span className="text-[0.75rem] text-muted-foreground">
            {primary ? "Required" : "Optional"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {words > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {words} words
            </span>
          )}
          {words > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Clear ${label}`}
              disabled={disabled}
              onClick={() => onChange("")}
            >
              <X aria-hidden />
            </Button>
          )}
          {onRemove && words === 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${label}`}
              disabled={disabled}
              onClick={onRemove}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* The shadcn base sets field-sizing-content, so a pasted posting would
          otherwise stretch to ~25 lines and push the commit bar off screen.
          Cap the height and scroll. The primary slot is deliberately more than
          twice the height of the optional ones — the size difference is what
          tells a student which field is the job. */}
      <Textarea
        aria-label={label}
        value={value}
        placeholder={hint}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 py-3.5 font-mono text-[0.8125rem] leading-relaxed focus-visible:ring-0 md:text-[0.8125rem]",
          primary ? "max-h-88 min-h-60" : "max-h-56 min-h-28",
        )}
      />

      {/* Guidance as persistent text rather than as a placeholder, because a
          placeholder is gone exactly when the student needs it. */}
      {primary && (
        <p className="border-t border-rule px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Responsibilities and requirements are the parts we read. Formatting
          does not matter.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Inert. No props, no state, no handlers — this is a picture of the product,
 * and it says so twice: the "Preview" tag in the header and the sentence
 * underneath it in the caller. Ink surface, because in this design paper is
 * for input and ink is for analysis, and this is what the analysis looks like.
 */
function OutcomePreview() {
  return (
    <figure
      aria-label="Preview of a finished schedule card"
      className="ink-band overflow-hidden rounded-2xl"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-rule px-5 py-3">
        <span className="eyebrow text-ink-muted">What you get back</span>
        <span className="eyebrow rounded-full border border-ink-rule px-2 py-1 text-ink-muted">
          Preview
        </span>
      </figcaption>

      <div className="px-5 pt-5 pb-4">
        <p className="data text-[0.6875rem] tracking-[0.08em] text-ink-muted uppercase">
          Fall 2026 · term 202670
        </p>
        <p className="display mt-2 text-[1.375rem] font-semibold text-ink-fg">
          Option A · close the data gap
        </p>
      </div>

      <ul className="border-t border-ink-rule">
        {PREVIEW_ROWS.map((row) => (
          <li
            key={row.code}
            className="flex items-start justify-between gap-4 border-b border-ink-rule px-5 py-3"
          >
            <div className="min-w-0">
              <p className="data text-sm font-medium text-ink-fg">{row.code}</p>
              <p className="mt-0.5 truncate text-[0.8125rem] text-ink-muted">
                {row.title}
              </p>
              {row.bottleneck && (
                // Never colour alone: the icon and the word carry it too.
                <p className="mt-1.5 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-critical-soft">
                  <TriangleAlert className="size-3" aria-hidden />
                  Bottleneck
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="data text-xs text-ink-fg">CRN {row.crn}</p>
              <p className="data mt-0.5 text-[0.6875rem] text-ink-muted">
                {row.meets}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-5 py-4">
        <p className="eyebrow text-ink-muted">
          Closes a skill your postings asked for
        </p>
        {/* O*NET 20.1 DWA text, verbatim. §9.3: keeping the string unedited is
            a CC BY 4.0 condition, so it wraps rather than truncating. */}
        <p className="mt-2.5 inline-flex items-start gap-1.5 rounded-lg bg-covered/30 px-2.5 py-1.5 text-xs leading-snug text-covered-soft">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Determine appropriate methods for data analysis.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-rule px-5 py-3 text-[0.6875rem] text-ink-muted">
        <span>
          <span className="data text-ink-fg">3</span> courses
        </span>
        <span>
          <span className="data text-ink-fg">9</span> credits
        </span>
        <span>
          <span className="data text-ink-fg">1</span> bottleneck cleared
        </span>
      </div>
    </figure>
  );
}
