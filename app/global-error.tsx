"use client";

/**
 * The root layout itself threw. This replaces it — including `<html>`,
 * `<body>`, the fonts, and the Footer that carries §13's persistent advisor
 * disclaimer — so nothing this file needs can be assumed to exist.
 *
 * Which is why it is styled INLINE and not with Tailwind. Next's own docs are
 * explicit that global-error "renders its own document and does not include
 * your global styles"; app/globals.css and the two next/font families are both
 * pulled in by the layout that is no longer mounted. A Tailwind class here
 * would render as unstyled text, and the whole point of the file is that the
 * catastrophic path still looks like the product.
 *
 * The colours are the literal values of --canvas, --foreground and
 * --muted-foreground from app/globals.css rather than `var()` references,
 * because the stylesheet that defines those custom properties is not loaded.
 * They are duplicated here on purpose and scripts/check-contrast.ts does not
 * see them, so if the palette moves, this file does not — an acceptable trade
 * for a screen that should never render.
 *
 * The one thing this page must NOT do is claim anything about the student's
 * data or their degree (§0 rule 7). It knows nothing at this point.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "oklch(0.972 0.006 92)",
          color: "oklch(0.21 0.022 265)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <title>Something went wrong — Reverse Audit</title>
        <div
          style={{
            maxWidth: "36rem",
            margin: "0 auto",
            padding: "6rem 1.5rem",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "2rem",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              fontWeight: 600,
            }}
          >
            Reverse Audit could not load
          </h1>
          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "oklch(0.505 0.016 265)",
            }}
          >
            Nothing was uploaded anywhere and nothing was saved. Reloading is
            usually enough.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "oklch(0.505 0.016 265)",
              }}
            >
              Reference {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "2rem",
              height: "2.75rem",
              padding: "0 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "oklch(0.21 0.022 265)",
              color: "oklch(0.99 0.004 264)",
              fontSize: "1rem",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
