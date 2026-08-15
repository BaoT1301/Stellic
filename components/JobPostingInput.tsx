"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";

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
      <header className="max-w-3xl">
        <h1 className="text-4xl text-balance sm:text-5xl">
          Paste the job you want in two years.
        </h1>
        {/*
          ONE lede. This was two paragraphs saying the same thing at the same
          size — the mechanism, then the outcome. Only the outcome earns the
          space above the fold, and it still glosses CRN once, in place, which is
          the reason the second paragraph existed.
        */}
        <p className="mt-5 text-lg text-muted-foreground text-pretty">
          Not the one you can get today. You get three Fall 2026 schedules built
          from real sections, with the CRNs you paste into registration.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="xl" onClick={onLoadSamples} disabled={isWorking}>
          <Sparkles aria-hidden />
          Load sample postings
        </Button>
        {/* "Three" was false — SAMPLE_POSTING_URLS in app/page.tsx has two, and
            the toast already said "Two sample postings loaded". */}
        <p className="text-sm text-muted-foreground">
          Two real listings. Fastest way in.
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
          // Three elevation states, and they are the whole feedback loop on this
          // screen: resting, being typed into, and holding something. Previously
          // every box sat flat against the paper until it had content, at which
          // point it gained a 1px ring you had to look for. focus-within is what
          // makes the box you are typing in the one object that is off the page.
          return (
            <div
              key={slot.label}
              className={cn(
                "flex flex-col rounded-xl bg-card ring-1 ring-foreground/[0.06] transition-shadow duration-200",
                "focus-within:shadow-e2",
                words > 0 ? "shadow-e2" : "shadow-e1",
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
