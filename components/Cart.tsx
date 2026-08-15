"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, ExternalLink, Info, X } from "lucide-react";
import { toast } from "sonner";

import { CrnLink, formatMeeting } from "@/components/ScheduleCard";
import { Button } from "@/components/ui/button";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";
import type { ScheduleOption } from "@/lib/types";

/**
 * CLAUDE.md §13: "Selecting a card leads to the cart: course list with CRNs, a
 * copy button, and a 'register' button that goes to /register."
 *
 * This is the last frame of the demo video, so it is built as the END OF A
 * TRANSACTION rather than as another card in the stack: a receipt on the dark
 * analysis surface, with the CRN string the student actually pastes set as the
 * largest thing on the panel, a ruled item list, a total line, and one primary
 * action. Nothing here is a suggestion any more.
 *
 * The CRN is the whole product claim. §4: we are the only thing that goes job
 * posting to O*NET work activity to a specific CRN the student can register for
 * next term. Every one of them links to its own page on the public schedule of
 * classes, so "are these real?" is one click rather than an assertion.
 *
 * The linked-lab line is required and static. §9.1 drops non-lecture rows at
 * scrape time, which keeps the frozen Section contract simple but means a
 * course with a required laboratory shows only its lecture here.
 *
 * The `-mx-6 px-6` bleed assumes the page gutter in app/page.tsx. That is the
 * only place this renders, and the band has to reach the edge of the column or
 * it reads as one more card.
 */

export interface CartProps {
  option: ScheduleOption;
  onClear?: () => void;
}

export function Cart({ option, onClear }: CartProps) {
  const [copied, setCopied] = useState(false);
  const crns = option.courses.map((c) => c.section.crn);
  const crnText = crns.join(", ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(crnText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("CRNs copied", { description: crnText });
    } catch {
      // Clipboard access can be denied outright; never leave the student stuck.
      toast.error("Couldn't reach the clipboard", { description: crnText });
    }
  }

  return (
    <aside className="ink-band -mx-6 px-6 pt-9 pb-10 duration-300 animate-in fade-in slide-in-from-bottom-2 sm:pt-11 sm:pb-12">
      {/* ---------------------------------------------------------------- *
       * Who this is and what it is worth.
       * ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-muted">
            Ready to register · {NEXT_TERM_LABEL} · term{" "}
            <span className="data">{NEXT_TERM_BANNER_CODE}</span>
          </p>
          <h2 className="display mt-3 text-[2rem] font-semibold sm:text-[2.5rem]">
            {option.label}
          </h2>
        </div>
        {onClear && (
          <Button
            variant="ghost"
            size="lg"
            onClick={onClear}
            className="h-10 border border-ink-rule px-3.5 text-ink-muted hover:bg-ink-fg/10 hover:text-ink-fg focus-visible:border-ink-fg focus-visible:ring-ink-fg/40"
          >
            <X aria-hidden data-icon="inline-start" />
            Clear cart
          </Button>
        )}
      </div>

      {/* ---------------------------------------------------------------- *
       * The money line. This exact string is what gets pasted into
       * registration, so it is the largest type on the panel and it is
       * select-all on click.
       * ---------------------------------------------------------------- */}
      <div className="mt-8">
        <p className="eyebrow text-ink-muted">
          The <span className="data">{crns.length}</span> numbers you paste into
          registration
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="data min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink-2 px-4 py-3.5 text-lg font-semibold whitespace-nowrap text-ink-fg ring-1 ring-ink-rule select-all sm:text-xl">
            {crnText}
          </p>
          <Button
            onClick={copy}
            variant="outline"
            size="lg"
            className="h-12 shrink-0 border-ink-rule bg-ink-2 px-5 text-[0.9375rem] text-ink-fg hover:bg-ink-fg/10 hover:text-ink-fg focus-visible:border-ink-fg focus-visible:ring-ink-fg/40"
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy CRNs"}
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- *
       * The itemised receipt.
       * ---------------------------------------------------------------- */}
      <ul className="mt-9 border-t border-ink-rule">
        {option.courses.map((course) => (
          <li
            key={course.section.crn}
            className="grid gap-x-8 gap-y-1 border-b border-ink-rule py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-baseline"
          >
            <CrnLink
              crn={course.section.crn}
              code={course.code}
              tone="ink"
              size="md"
            />
            <p className="min-w-0 text-sm">
              <span className="data font-medium text-ink-fg">
                {course.code}
              </span>{" "}
              <span className="text-ink-muted">{course.title}</span>
            </p>
            <p className="data text-xs text-ink-muted sm:justify-self-end">
              {formatMeeting(course.section)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b-2 border-ink-rule py-4">
        <p className="eyebrow text-ink-muted">Total</p>
        <p className="text-sm text-ink-muted">
          <span className="data text-ink-fg">{option.courses.length}</span>{" "}
          {option.courses.length === 1 ? "course" : "courses"} ·{" "}
          <span className="data text-ink-fg">{option.totalCredits}</span>{" "}
          credits · {NEXT_TERM_LABEL}
        </p>
      </div>

      {/* ---------------------------------------------------------------- *
       * One primary action. §15 keeps /register on the never-cut list: it is
       * how the video ends.
       * ---------------------------------------------------------------- */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href={`/register?crns=${crns.join(",")}`}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-ink-fg px-6 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-fg"
        >
          Register these CRNs
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <p className="max-w-xs text-xs leading-relaxed text-ink-muted">
          Opens our simulated registration page with these CRNs already filled
          in. Production would connect to the institution&rsquo;s SIS.
        </p>
      </div>

      <div className="mt-9 grid gap-2.5 border-t border-ink-rule pt-5 text-xs leading-relaxed text-ink-muted sm:grid-cols-2 sm:gap-x-10">
        <p className="flex items-start gap-2">
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Every CRN above opens that section on Patriot Web, the public schedule
          of classes, where the seat count is listed.
        </p>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Some courses also require a linked lab or recitation section. Check
          Patriot Web before submitting.
        </p>
      </div>
    </aside>
  );
}
