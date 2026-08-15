"use client";

import { ArrowRight, X } from "lucide-react";

import { Sep } from "@/components/Sep";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * State 1 — CLAUDE.md §13. Three textareas, "paste a job posting you'd want in
 * two years", plus a sample-fill button.
 *
 * The sample button is deliberately the loudest thing on the screen after the
 * headline: §13 says "the judge will use this, so make it prominent." A judge
 * opening the live link has no job postings to hand, and the demo has to reach
 * State 3 without them typing anything.
 */

const SLOT_HINTS = [
  { label: "Posting 1", hint: "e.g. Software Engineer, new grad" },
  { label: "Posting 2", hint: "e.g. Data Analyst / Junior Data Scientist" },
  { label: "Posting 3", hint: "e.g. Backend or platform engineer" },
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

  return (
    <section className="animate-in fade-in duration-500">
      {/* No step eyebrow. The Stepper directly above this already renders "Job
          postings" as the active step, so a second label saying the same thing
          was the screen's first line of redundancy — and it was repeated on all
          four states. This is the entry screen and keeps a hero headline; the
          two tool screens (3 and 4) do not. */}
      {/*
        COPY RULE for the four screen headlines, and the reason this one changed.

        The old set — "Paste the job you want in two years.", "Now the boring
        half.", "Not every box on your audit weighs the same.", "Three ways to
        spend next term." — were aphorisms: short declarative fragments, each
        one a small reveal. Four of them in sequence is a recognisable register,
        and it is the register of generated marketing copy. It also fights the
        product: this is an instrument a student uses once a term, and every
        headline was selling rather than saying where you are.

        The rule now is that a headline states the task in the student's own
        words. The persuasive lines were not deleted — they moved into the
        ledes, where a sentence is allowed to be a sentence.
      */}
      <header className="max-w-3xl">
        <h1 className="text-4xl text-balance sm:text-5xl">
          Which jobs are you aiming for?
        </h1>
        {/*
          ONE lede. This was two paragraphs saying the same thing at the same
          size — the mechanism, then the outcome. Only the outcome earns the
          space above the fold, and it still glosses CRN once, in place, which is
          the reason the second paragraph existed.

          "UP TO three schedules", never "three". §11.3 step 7 walks the three
          strategies and skips any whose best surviving combo is one another
          strategy already took, rather than rendering a duplicate — so two
          cards is a correct outcome, and the step-8 floor returns exactly one.
          ScheduleOptions' headline counts what actually came back, so a flat
          "three" here would have the first screen contradicting the fourth
          inside one session. The sentence beside those cards was already
          written this way (`options.length === 3 ? "the three" : "they"`).
        */}
        <p className="mt-5 text-lg text-muted-foreground text-pretty">
          Paste up to three postings — the job you want in two years, not the one
          you could get today. You get up to three Fall 2026 schedules built from
          real sections, with the CRNs you paste into registration.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* No icon. This button carried a <Sparkles/>, which is the most
            recognisable AI-product signifier there is — and it is pointing at
            two committed .txt files, which is the least magical thing in the
            build. The label already says what it does. */}
        <Button size="xl" onClick={onLoadSamples} disabled={isWorking}>
          Load sample postings
        </Button>
        {/* "Three" was false — SAMPLE_POSTING_URLS in app/page.tsx has two, and
            the toast already said "Two sample postings loaded". */}
        <p className="text-sm text-muted-foreground">
          Two real listings, if you don&rsquo;t have one to hand.
        </p>
      </div>

      {/* Provenance, in the first two seconds. Flips the opening frame from
          landing page to instrument, and every number is committed data. Set as
          a rule-separated run rather than a middot-joined string: these are four
          measurements, not a sentence. */}
      <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-mono font-medium text-foreground">689</span>{" "}
          courses
        </span>
        <Sep />
        <span className="tabular-nums">
          <span className="font-mono font-medium text-foreground">985</span>{" "}
          sections
        </span>
        <Sep />
        <span className="tabular-nums">
          <span className="font-mono font-medium text-foreground">270</span>{" "}
          prereq rules
        </span>
        <Sep />
        <span>GMU public catalog</span>
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {SLOT_HINTS.map((slot, i) => {
          const value = postings[i] ?? "";
          const words = wordCount(value);
          // Three states, and they are the whole feedback loop on this screen:
          // resting, being typed into, and holding something. These used to be
          // three drop-shadow levels; they are now three border weights, which
          // says the same thing on a flat page and survives a greyscale print.
          return (
            <div
              key={slot.label}
              className={cn(
                "flex flex-col rounded-md border bg-card transition-colors duration-200",
                "focus-within:border-brand",
                words > 0 ? "border-foreground/30" : "border-rule",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
                <span className="eyebrow text-muted-foreground">
                  {slot.label}
                </span>
                {words > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {words} words
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Clear ${slot.label}`}
                      onClick={() => onChange(i, "")}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Optional</span>
                )}
              </div>
              {/* The shadcn base sets field-sizing-content, so a pasted posting
                  would otherwise stretch the card to ~25 lines and push the
                  continue button off screen. Cap the height and scroll. */}
              <Textarea
                aria-label={slot.label}
                value={value}
                placeholder={slot.hint}
                onChange={(e) => onChange(i, e.target.value)}
                className="max-h-72 min-h-56 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 md:text-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        <p className="text-sm text-muted-foreground tabular-nums">
          {filled === 0
            ? "Add at least one posting to continue."
            : `${filled} of 3 ready. More postings sharpen the ranking.`}
        </p>
        <Button size="xl" onClick={onSubmit} disabled={!canContinue}>
          {isWorking ? "Reading the postings…" : "Next: your audit"}
          {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
        </Button>
      </div>
    </section>
  );
}
