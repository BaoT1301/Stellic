import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";

/**
 * Persistent advisor disclaimer. CLAUDE.md §13 requires this on EVERY screen and
 * §15 puts it on the never-cut list: "registrars in the judging room will trust
 * the product more for it."
 *
 * The wording is fixed. Do not soften it, do not make it dismissible, and do not
 * move the O*NET attribution into it — §9.3 keeps that in TOOLS.md and README so
 * this footer stays doing one job.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl">
          Suggestions based on public job postings and course descriptions.
          Confirm with your advisor before registering.
        </p>
        <p className="shrink-0 tabular-nums">
          Sections from the public schedule of classes ·{" "}
          <span className="font-medium text-foreground">{NEXT_TERM_LABEL}</span>{" "}
          · term {NEXT_TERM_BANNER_CODE}
        </p>
      </div>
    </footer>
  );
}
