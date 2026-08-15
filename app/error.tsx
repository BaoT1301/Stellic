"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The last stop for a render throw inside the route segment — CLAUDE.md §0
 * rule 3, "never break the demo path". Every API route already degrades to a
 * cached fixture instead of a 500, which is why this file did not exist; but
 * that only covers the network seams. A throw in a component's render, in a
 * `useMemo`, or in an event handler React re-throws went straight to Next's
 * default error page — a stack trace in development, an unstyled "something
 * went wrong" in production. Either one is a blank screen in the demo video.
 *
 * This does not try to recover the flow, and says so. It cannot: §5 closed the
 * database, so the audit and the postings live entirely in the state of the
 * tree that just unmounted. Inventing a partial recovery would risk showing
 * half a diagnosis as though it were whole, which is the §0 rule 7 failure this
 * codebase keeps having to fix.
 *
 * The root layout stays mounted around this, so the persistent advisor
 * disclaimer in the footer (§13) is still on screen here.
 *
 * `retry`, not `reset`: Next 16 prefers it and `reset` is documented as the
 * narrow case. See node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start px-6 pt-20 pb-24">
        <h1 className="text-3xl text-balance sm:text-4xl">
          Something went wrong on this screen
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Nothing was uploaded anywhere and nothing was saved. Starting over
          clears the screen — you will need to paste the job postings and load
          your audit again.
        </p>
        {/* The digest is the only handle on a production stack trace, which is
            stripped out of `error.message` before it reaches the browser.
            Shown rather than hidden: it is what makes a bug report actionable. */}
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Reference {error.digest}
          </p>
        )}
        <Button size="xl" onClick={() => retry()} className="mt-8">
          Start over
        </Button>
      </div>
    </main>
  );
}
