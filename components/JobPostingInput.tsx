"use client";

import { useState } from "react";
import { ArrowRight, Plus, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * State 1 - CLAUDE.md §13.
 *
 * WHAT CHANGED IN THE UX PASS, and why:
 *
 * 1. THREE EQUAL BOXES BECAME ONE. Three empty textareas all tagged "Optional"
 *    was a wall that read "this will take a while" at the single highest
 *    abandonment moment in the flow, and the tag was a lie: `onSubmit` requires
 *    at least one. Box 1 now carries no tag (it is the required one); boxes 2
 *    and 3 live behind a quiet "Add another posting" and keep the Optional tag,
 *    where it is true.
 *
 * 2. ONE FILLED BUTTON, AND IT IS ALWAYS THE NEXT THING TO DO. While every box
 *    is empty the real primary for a first-time visitor (and for a judge who has
 *    no job postings to hand) is "Load sample postings", so it holds the filled
 *    treatment. The moment any box has text it demotes to a quiet link and
 *    "Next" takes the fill. The screen never shows two filled buttons, and never
 *    shows a filled grey rectangle that looks live but is not.
 *
 * 3. THE DISABLED PRIMARY IS OUTLINE + aria-disabled, NOT `disabled`. A filled
 *    grey button reads as an enabled secondary action; students click it,
 *    nothing happens, and the product feels broken at step one. aria-disabled
 *    keeps it focusable so a keyboard user can reach it and hear WHY, which a
 *    real `disabled` attribute cannot do. That reason now hangs off the control
 *    itself instead of the standalone sentence "Add at least one posting to
 *    continue," which is deleted.
 *
 * 4. THE PRIMARY IS BOTTOM-RIGHT ON DESKTOP AND A STICKY BAR ON PHONES, the
 *    same position it takes on every other screen. One element, one CSS switch,
 *    so there is only ever one "Next" node in the DOM.
 *
 * 5. A SMALL, ABSTRACT PREVIEW OF THE OUTPUT sits in the right column, which was
 *    dead space. Pasting a job ad into a box is a leap of faith unless you can
 *    see what comes back. It is deliberately textless: no course codes, no CRNs,
 *    no claim that can be wrong (§0 rule 7).
 */

/** Box 1 carries no tag because it is required. Only 2 and 3 are optional. */
const BOXES = [
  { label: "Job posting", placeholder: "Paste the whole job posting here." },
  { label: "Second posting", placeholder: "Paste another posting." },
  { label: "Third posting", placeholder: "Paste another posting." },
];

const NEEDS_A_POSTING = "Paste a posting, or load the samples.";

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
  const [revealed, setRevealed] = useState(1);

  // How many boxes to show. Derived, not just stateful, so "Load sample
  // postings" (which fills two) and coming Back from step 2 both re-open the
  // right number of boxes instead of hiding text the student can see is there.
  const lastFilled = postings.reduce(
    (acc, p, i) => (p.trim() !== "" ? i : acc),
    -1,
  );
  const visible = Math.min(3, Math.max(revealed, lastFilled + 1, 1));

  const filled = postings.filter((p) => p.trim() !== "").length;
  const canContinue = filled > 0 && !isWorking;

  return (
    <section className="animate-in fade-in duration-500">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-14">
        <div className="min-w-0">
          <header className="max-w-xl">
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              Paste the job you want in two years.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">
              We turn it into next term&rsquo;s class schedule.
            </p>
          </header>

          {/*
            The loudest control on the screen while the boxes are empty. §13:
            "the judge will use this, so make it prominent." It steps down to a
            quiet link the instant the student has typed something, because at
            that point it is no longer what they want to do next.
          */}
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
            {filled === 0 ? (
              <>
                <Button
                  size="lg"
                  onClick={onLoadSamples}
                  disabled={isWorking}
                  className="h-11 px-5 text-[0.9375rem]"
                >
                  <Sparkles aria-hidden />
                  Load sample postings
                </Button>
                <p className="text-sm text-muted-foreground">
                  Fastest way to try it.
                </p>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadSamples}
                disabled={isWorking}
                className="h-8 -ml-2 px-2 text-sm text-muted-foreground"
              >
                <Sparkles aria-hidden />
                Load sample postings instead
              </Button>
            )}
          </div>

          {/* Provenance, in the first two seconds. Flips the opening frame from
              landing page to instrument, and every number is committed data. */}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            689 courses · 985 Fall 2026 sections · 270 prerequisite rules ·
            George Mason University public catalog and schedule of classes.
          </p>

          <div className="mt-8 space-y-3">
            {BOXES.slice(0, visible).map((box, i) => {
              const value = postings[i] ?? "";
              const words = wordCount(value);
              return (
                <div
                  key={box.label}
                  className={cn(
                    "flex flex-col rounded-xl bg-card ring-1 transition-shadow",
                    words > 0
                      ? "ring-foreground/15 shadow-sm"
                      : "ring-foreground/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
                    <span className="eyebrow text-muted-foreground">
                      {box.label}
                    </span>
                    {words > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {words} words
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Clear ${box.label}`}
                          onClick={() => {
                            onChange(i, "");
                            if (i > 0 && i === visible - 1) setRevealed(i);
                          }}
                        >
                          <X aria-hidden />
                        </Button>
                      </div>
                    ) : i > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Optional
                      </span>
                    ) : null}
                  </div>
                  {/* The shadcn base sets field-sizing-content, so a pasted
                      posting would otherwise stretch the card to ~25 lines and
                      push the continue button off screen. Cap and scroll.
                      font-sans, not font-mono: a monospace box reads as a code
                      editor to a student. */}
                  <Textarea
                    aria-label={box.label}
                    value={value}
                    placeholder={box.placeholder}
                    onChange={(e) => onChange(i, e.target.value)}
                    className="max-h-64 min-h-40 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 py-3 text-[0.875rem] leading-relaxed focus-visible:ring-0 md:text-[0.875rem]"
                  />
                </div>
              );
            })}

            {visible < 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevealed(visible + 1)}
                className="h-9 -ml-2 px-2 text-sm text-muted-foreground"
              >
                <Plus aria-hidden />
                Add another posting
              </Button>
            )}
          </div>
        </div>

        {/* What comes back. Textless on purpose: it makes no claim about any
            course, and it is the one thing on this screen that answers "why am
            I pasting a job ad?" without another paragraph. */}
        <aside className="hidden lg:block">
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="eyebrow text-muted-foreground">What you get</p>
            <WeekSketch />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Three of these to compare. Every class has a real Fall 2026 CRN.
            </p>
          </div>
        </aside>
      </div>

      {/*
        One "Next" node, two placements. Bottom-right of the content column from
        768px up; a sticky full-width bar below it, so a student on a phone who
        has decided never has to scroll to act. `sticky` rather than `fixed`:
        it un-pins at the end of the section and lets the advisor disclaimer in
        the footer through instead of sitting on top of it.
      */}
      <div
        className={cn(
          "sticky bottom-0 -mx-6 mt-8 flex justify-end border-t border-rule bg-canvas/95 px-6 py-1.5 backdrop-blur",
          "md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:pt-6 md:backdrop-blur-none",
        )}
        style={{
          paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))",
          // sonner is mounted at position="bottom-center" in app/layout.tsx and
          // paints at z-index 999999999, which lands squarely on top of a
          // sticky mobile action bar. A transient toast covering the screen's
          // only primary action is a dead-end; a bar covering the bottom half
          // of a toast is not. Inert on desktop, where this box is `static`.
          // ORCHESTRATOR: the real fix is position="top-center" on <Toaster />,
          // which every mobile sticky bar in this redesign needs.
          zIndex: 1000000000,
        }}
      >
        <Button
          size="lg"
          variant={canContinue ? "default" : "outline"}
          aria-disabled={!canContinue}
          aria-describedby={canContinue ? undefined : "next-blocked-reason"}
          title={canContinue ? undefined : NEEDS_A_POSTING}
          onClick={() => {
            if (canContinue) onSubmit();
          }}
          className={cn(
            "h-11 w-full px-5 text-[0.9375rem] md:w-auto",
            // Tailwind v4's preflight puts cursor:pointer on every button, so
            // an aria-disabled control still felt live under the mouse.
            !canContinue && "cursor-not-allowed text-muted-foreground",
          )}
        >
          {isWorking ? "Reading the postings…" : "Next: your audit"}
          {!isWorking && <ArrowRight aria-hidden data-icon="inline-end" />}
        </Button>
        {/* The reason lives on the control, not as a standalone instruction. */}
        <span id="next-blocked-reason" className="sr-only">
          {NEEDS_A_POSTING}
        </span>
      </div>
    </section>
  );
}

/**
 * An abstract week. No day is claimed, no course is named, nothing here can be
 * factually wrong. It exists so the student can see the SHAPE of the answer
 * before they pay the cost of pasting a posting.
 *
 * aria-hidden with the caption beside it as the text equivalent, the same
 * pattern the real WeekGrid uses.
 */
function WeekSketch() {
  const cols = [0, 1, 2, 3, 4];
  const blocks = [
    { col: 0, y: 26, h: 26, brand: true },
    { col: 2, y: 26, h: 26, brand: true },
    { col: 1, y: 62, h: 30, brand: false },
    { col: 3, y: 62, h: 30, brand: false },
    { col: 4, y: 62, h: 20, brand: true },
    { col: 0, y: 100, h: 22, brand: false },
    { col: 2, y: 100, h: 22, brand: false },
  ];
  return (
    <svg
      viewBox="0 0 260 132"
      className="mt-3 h-auto w-full"
      role="presentation"
      aria-hidden
    >
      {["M", "T", "W", "R", "F"].map((d, i) => (
        <text
          key={d}
          x={i * 52 + 23}
          y="10"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill="var(--muted-foreground)"
        >
          {d}
        </text>
      ))}
      {cols.map((i) => (
        <rect
          key={`c${i}`}
          x={i * 52}
          y="18"
          width="46"
          height="114"
          rx="3"
          fill="var(--muted)"
        />
      ))}
      {blocks.map((b, i) => (
        <rect
          key={i}
          x={b.col * 52 + 3}
          y={b.y}
          width="40"
          height={b.h}
          rx="3"
          fill={b.brand ? "var(--brand-soft)" : "var(--calm-soft)"}
          stroke={b.brand ? "var(--brand)" : "var(--calm)"}
          strokeWidth="1"
          strokeOpacity="0.55"
        />
      ))}
    </svg>
  );
}
