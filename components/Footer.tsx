import { Sep } from "@/components/Sep";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";

/**
 * Persistent advisor disclaimer. CLAUDE.md §13 requires this on EVERY screen and
 * §15 puts it on the never-cut list: "registrars in the judging room will trust
 * the product more for it."
 *
 * The wording is fixed. Do not soften it, do not make it dismissible, and do not
 * move the O*NET attribution into it — §9.3 keeps that in TOOLS.md and README so
 * this footer stays doing one job.
 *
 * The second sentence was added for the judging audience specifically: a
 * registrar's first question about anything that reads a degree audit is which
 * document controls when the two disagree. Saying it first costs nothing.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl">
          Suggestions based on public job postings and course descriptions.
          Confirm with your advisor before registering. Not an official degree
          audit - your official audit and the University Catalog govern.
        </p>
        <p className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
          <span>Sections from the public schedule of classes</span>
          <Sep />
          <span className="font-medium text-foreground">{NEXT_TERM_LABEL}</span>
          <Sep />
          <span className="font-mono">term {NEXT_TERM_BANNER_CODE}</span>
        </p>
      </div>
    </footer>
  );
}
