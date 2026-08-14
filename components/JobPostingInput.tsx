"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";

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
      <header className="max-w-3xl">
        <p className="eyebrow text-brand">Step 1 · the job you want</p>
        <h1 className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Paste the job you want in two years.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
          Not the one you can get today. We read what these postings actually ask
          for, match it against what your remaining requirements already teach
          you, and work backwards into next term&rsquo;s course list.
        </p>
        {/*
          The words CRN, register and "three schedules" appeared nowhere above
          the fold, so a student had no idea what they were pasting a job ad FOR.
          This is the outcome sentence, and it glosses CRN once, in place.
        */}
        <p className="mt-3 text-lg leading-relaxed text-foreground text-pretty">
          You get three Fall 2026 schedules built from real sections, with the
          actual CRNs you paste into registration.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={onLoadSamples}
          disabled={isWorking}
          className="h-11 px-5 text-[0.9375rem]"
        >
          <Sparkles aria-hidden />
          Load sample postings
        </Button>
        {/* "Three" was false — SAMPLE_POSTING_URLS in app/page.tsx has two, and
            the toast already said "Two sample postings loaded". */}
        <p className="text-sm text-muted-foreground">
          Two real early-career listings. Fastest way to see the whole thing.
        </p>
      </div>

      {/* Provenance, in the first two seconds. Flips the opening frame from
          landing page to instrument, and every number is committed data. */}
      <p className="mt-4 text-xs text-muted-foreground">
        689 courses · 985 Fall 2026 sections · 270 prerequisite rules ·
        George Mason University public catalog and schedule of classes.
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {SLOT_HINTS.map((slot, i) => {
          const value = postings[i] ?? "";
          const words = wordCount(value);
          return (
            <div
              key={slot.label}
              className={cn(
                "flex flex-col rounded-xl bg-card ring-1 transition-shadow",
                words > 0
                  ? "ring-foreground/15 shadow-sm"
                  : "ring-foreground/10",
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
                className="max-h-72 min-h-56 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[0.8125rem] leading-relaxed focus-visible:ring-0 md:text-[0.8125rem]"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        <p className="text-sm text-muted-foreground tabular-nums">
          {filled === 0
            ? "Add at least one posting to continue."
            : `${filled} of 3 postings ready. More postings sharpen the ranking.`}
        </p>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!canContinue}
          className="h-11 px-5 text-[0.9375rem]"
        >
          {isWorking ? "Reading the postings…" : "Next: your audit"}
          {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
        </Button>
      </div>
    </section>
  );
}
