"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Info, X } from "lucide-react";
import { toast } from "sonner";

import { formatMeeting } from "@/components/ScheduleCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type { ScheduleOption } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * CLAUDE.md §13: "Selecting a card → cart: course list with CRNs, a copy button,
 * and a 'register' button that goes to /register."
 *
 * The CRN is the whole product claim. §4: we are the only thing that goes job
 * posting → O*NET work activity → a specific CRN the student can register for
 * next term. So the CRN is the largest type on this panel, not a footnote.
 *
 * The linked-lab line is required and static. §9.1 drops non-lecture rows at
 * scrape time, which keeps the frozen Section contract simple but means a
 * course with a required laboratory shows only its lecture here.
 */

export interface CartProps {
  option: ScheduleOption;
  onClear?: () => void;
}

export function Cart({ option, onClear }: CartProps) {
  const [copied, setCopied] = useState(false);
  const crns = option.courses.map((c) => c.section.crn);

  async function copy() {
    const text = crns.join(", ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("CRNs copied", { description: text });
    } catch {
      // Clipboard access can be denied outright; never leave the student stuck.
      toast.error("Couldn't reach the clipboard", { description: text });
    }
  }

  return (
    <aside className="overflow-hidden rounded-xl bg-card ring-2 ring-brand/25 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule bg-brand-soft px-5 py-4">
        <div>
          <p className="eyebrow text-brand">Your cart · {NEXT_TERM_LABEL}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
            {option.label}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {option.courses.length} courses · {option.totalCredits} credits
          </span>
          {onClear && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Empty the cart"
              onClick={onClear}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
      </header>

      <ul className="divide-y divide-rule">
        {option.courses.map((course) => (
          <li
            key={course.section.crn}
            className="flex items-center gap-4 px-5 py-3"
          >
            <span className="w-16 shrink-0 font-mono text-lg leading-none font-semibold tabular-nums">
              {course.section.crn}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-mono font-medium">{course.code}</span>
                <span className="text-muted-foreground"> {course.title}</span>
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {formatMeeting(course.section)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4">
        {/* The CRNs travel to the mock registration page as a query param so it
            can prefill. §13: /register is deliberately plain and Banner-styled. */}
        <Link
          href={`/register?crns=${crns.join(",")}`}
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-10 px-4",
          )}
        >
          Register these CRNs
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Link>
        <Button variant="outline" size="lg" className="h-10 px-4" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy CRNs"}
        </Button>
      </div>

      <p className="flex items-start gap-2 border-t border-rule bg-canvas px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Some courses also require a linked lab or recitation section — check
        Patriot Web before submitting.
      </p>
    </aside>
  );
}
