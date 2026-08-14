"use client";

/**
 * /register — the mock registration page. CLAUDE.md §13, §5, §15.
 *
 * §5 closes the "actually register the student into a live SIS" question:
 * a judge in Philadelphia cannot log into GMU's Patriot Web, so it is the one
 * feature no judge can verify and the most expensive to build. We build this
 * instead. §15 puts it on the never-cut list — it is the ending of the video,
 * and without it the video ends on a list of courses, which is where every
 * other submission ends.
 *
 * THE PLAINNESS IS THE POINT. This page deliberately does not use shadcn/ui,
 * the Tailwind theme tokens, or anything else from the rest of the app. It is
 * 2008-era Banner 8 self-service: dense tables, a serif heading, 1px borders,
 * beveled grey submit buttons, blue underlined links. Colours are hardcoded
 * and light-only rather than themed, because the system it imitates has no dark
 * mode. Registrars in the judging room recognise this layout instantly, and the
 * jump-cut from the polished app into it is what sells "this ends in a real
 * registration cart" better than any amount of copy.
 *
 * Contract with Cart.tsx: navigate to /register?crns=77905,77906,80167
 * Comma or whitespace separated. Anything that is not a 4-6 digit CRN is
 * dropped rather than rendered, so a malformed link degrades to an empty
 * worksheet instead of a broken page (§0 rule 3: never break the demo path).
 *
 * The simulation notice sits directly under the h1 AND in the footer. It used to
 * be footer-only, ~788px down, which is below the fold on a 1440x900 laptop —
 * so an honest first read of a screenshot of this page was "they registered
 * him." Banner puts institutional notices under the heading anyway.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { Course } from "@/lib/types";
import { NEXT_TERM_BANNER_CODE, NEXT_TERM_LABEL } from "@/lib/types";

/** Banner's Add Classes Worksheet has ten fixed CRN boxes. So does ours. */
const WORKSHEET_ROWS = 10;

/**
 * §8 comment on NEXT_TERM: "Registration runs Apr 14 - Aug 31, 2026, so a judge
 * opening the link on Aug 21 can verify a CRN is real AND still registerable."
 * Banner calls that window a time ticket and prints it on this exact screen, so
 * the dates are the ones already established as true rather than new claims.
 */
const TIME_TICKET = "Registration open Apr 14 - Aug 31, 2026";

function parseCrns(raw: string): string[] {
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,]+/)) {
    const t = token.trim();
    // Banner CRNs are five digits at GMU; accept 4-6 so a different
    // institution's codes still render rather than silently vanishing.
    if (/^\d{4,6}$/.test(t)) seen.add(t);
  }
  return [...seen].slice(0, WORKSHEET_ROWS);
}

/**
 * Credits per CRN, derived from the same committed catalog every other screen
 * reads. Loaded the way app/page.tsx loads it — a dynamic import, so the 698 KB
 * of catalog is a separate chunk instead of part of this route's first load. It
 * is almost always already in the browser cache here, because the only way in
 * is the cart. On failure the total simply does not render: §0 rule 3 says
 * degrade, and an absent line is better than an invented number (§0 rule 7).
 */
function useCreditsByCrn(): Record<string, number> | null {
  const [map, setMap] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/data/courses.json")
      .then((mod) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const course of mod.default as unknown as Course[]) {
          for (const section of course.sections) next[section.crn] = course.credits;
        }
        setMap(next);
      })
      .catch(() => {
        /* leave it null; the Total Credit Hours line stays off. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}

/**
 * Banner prints credit hours to three decimals because the field is numeric and
 * some courses are variable-credit. Matching the format matters more than the
 * number here — it is one of the first things a registrar's eye lands on.
 * CRNs we cannot resolve contribute nothing rather than an assumed 3.
 */
function TotalCreditHours({
  crns,
  creditsByCrn,
}: {
  crns: string[];
  creditsByCrn: Record<string, number> | null;
}) {
  if (creditsByCrn === null) return null;
  const total = crns.reduce((sum, crn) => sum + (creditsByCrn[crn] ?? 0), 0);
  return (
    <p className="mt-3 text-[12px] font-bold">
      Total Credit Hours: {total.toFixed(3)}
    </p>
  );
}

/**
 * The one line that keeps an honest first read of this page from being "they
 * registered him." It sat only in the footer, ~788px down, which is below the
 * fold on a 1440x900 laptop. Banner puts institutional notices directly under
 * the page heading and above the term block, so this is both the more honest
 * position and the more accurate one. The footer copy stays.
 */
function SimulationNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`border border-[#c9a227] bg-[#fdf7e3] px-3 py-2 text-[11px] font-bold text-[#5c4a06] ${className}`}
    >
      Simulated registration system. Production would connect to the
      institution&rsquo;s SIS.
    </p>
  );
}

/** The page heading. Duplicated across the worksheet and its Suspense fallback,
 *  so it and the notice beneath it are one component rather than two copies. */
function PageHeading() {
  return (
    <>
      <h1
        className="border-b-2 border-[#1c3f5f] pb-1 text-[22px] font-bold text-[#1c3f5f]"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        Add or Drop Classes
      </h1>
      <SimulationNotice className="mt-3" />
    </>
  );
}

/* ------------------------------------------------------------------ chrome */

function BannerChrome({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-white text-[13px] text-black"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {/* Institutional header bar */}
      <div className="bg-[#1c3f5f] px-4 py-2.5 text-white">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between">
          <span
            className="text-[17px] font-bold tracking-tight"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Student Self-Service
          </span>
          <span className="text-[11px]">
            <span className="cursor-default underline">Return to Menu</span>
            <span className="px-1.5 text-[#9db6cc]">|</span>
            <span className="cursor-default underline">Site Map</span>
            <span className="px-1.5 text-[#9db6cc]">|</span>
            <span className="cursor-default underline">Help</span>
            <span className="px-1.5 text-[#9db6cc]">|</span>
            <span className="cursor-default underline">Exit</span>
          </span>
        </div>
      </div>

      {/* Breadcrumb strip */}
      <div className="border-b border-[#c3ccd4] bg-[#e9eef2] px-4 py-1.5">
        <div className="mx-auto max-w-4xl text-[11px] text-[#33475b]">
          Student Services &amp; Financial Aid &nbsp;&gt;&nbsp; Registration
          &nbsp;&gt;&nbsp; <span className="font-bold">Add or Drop Classes</span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-5">{children}</div>

      {/* Footer — the release string is what a real Banner page ends with. */}
      <div className="mx-auto mt-2 max-w-4xl px-4 pb-10">
        <hr className="border-t border-[#c3ccd4]" />
        <p className="mt-2 text-[10px] text-[#6b7883]">
          RELEASE: 8.7.1 &nbsp;&middot;&nbsp; Student Self-Service
        </p>
        {/* Second copy. The first one is under the h1, above the fold. */}
        <SimulationNotice className="mt-3" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

function RegisterWorksheet() {
  const searchParams = useSearchParams();
  const incoming = parseCrns(searchParams.get("crns") ?? "");

  // Ten worksheet boxes, the first N prefilled from the cart. Editable, because
  // Banner's are — and because an editable field proves this is a real form and
  // not a screenshot.
  const [rows, setRows] = useState<string[]>(() =>
    Array.from({ length: WORKSHEET_ROWS }, (_, i) => incoming[i] ?? ""),
  );
  const [registered, setRegistered] = useState<string[] | null>(null);
  const [stamp, setStamp] = useState("");
  const [error, setError] = useState("");
  const creditsByCrn = useCreditsByCrn();
  // Deduped the same way submit() dedupes, so typing one CRN into two boxes
  // cannot double its credits in the total.
  const filledRows = [
    ...new Set(rows.map((r) => r.trim()).filter((r) => r !== "")),
  ];

  const setRow = (i: number, value: string) => {
    // Banner's CRN boxes are numeric-only and length-capped.
    const clean = value.replace(/\D/g, "").slice(0, 6);
    setRows((prev) => prev.map((r, j) => (j === i ? clean : r)));
    setError("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = [...new Set(rows.map((r) => r.trim()).filter((r) => r !== ""))];

    if (entered.length === 0) {
      setError("No CRNs were entered. Enter at least one CRN in the worksheet below.");
      return;
    }
    const bad = entered.filter((c) => !/^\d{4,6}$/.test(c));
    if (bad.length > 0) {
      setError(`Invalid CRN: ${bad.join(", ")}. A CRN is 4 to 6 digits.`);
      return;
    }

    // Computed on click, never during render — a Date at module or render scope
    // is a hydration mismatch waiting to happen.
    setStamp(
      new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
    setRegistered(entered);
    setError("");
  };

  const reset = () => {
    setRows(Array.from({ length: WORKSHEET_ROWS }, (_, i) => incoming[i] ?? ""));
    setRegistered(null);
    setError("");
  };

  return (
    <BannerChrome>
      <PageHeading />

      {/* Term / student strip */}
      <table className="mt-3 w-full border-collapse border border-[#a8b4bf] text-[12px]">
        <tbody>
          <tr>
            <th className="w-[15%] border border-[#cdd6dd] bg-[#eef2f6] px-2 py-1 text-left font-bold text-[#1c3f5f]">
              Term
            </th>
            <td className="w-[35%] border border-[#cdd6dd] px-2 py-1">
              {NEXT_TERM_LABEL} ({NEXT_TERM_BANNER_CODE})
            </td>
            <th className="w-[15%] border border-[#cdd6dd] bg-[#eef2f6] px-2 py-1 text-left font-bold text-[#1c3f5f]">
              Student
            </th>
            <td className="border border-[#cdd6dd] px-2 py-1">
              Okoye, Daniel R. &nbsp;&middot;&nbsp; G01847362
            </td>
          </tr>
          <tr>
            <th className="border border-[#cdd6dd] bg-[#eef2f6] px-2 py-1 text-left font-bold text-[#1c3f5f]">
              Status
            </th>
            <td className="border border-[#cdd6dd] px-2 py-1">
              Eligible to register
            </td>
            <th className="border border-[#cdd6dd] bg-[#eef2f6] px-2 py-1 text-left font-bold text-[#1c3f5f]">
              Registration Holds
            </th>
            <td className="border border-[#cdd6dd] px-2 py-1">None</td>
          </tr>
          <tr>
            <th className="border border-[#cdd6dd] bg-[#eef2f6] px-2 py-1 text-left font-bold text-[#1c3f5f]">
              Time Ticket
            </th>
            <td className="border border-[#cdd6dd] px-2 py-1" colSpan={3}>
              {TIME_TICKET}
            </td>
          </tr>
        </tbody>
      </table>

      {registered === null ? (
        <>
          <p className="mt-4 text-[12px] leading-relaxed">
            To add a class, enter the Course Reference Number (CRN) in the Add
            Classes Worksheet below and select <b>Submit Changes</b>. To drop a
            class, use the Action column of your current schedule. Some courses
            require a linked laboratory or recitation section that must be added
            at the same time.
          </p>

          {error !== "" && (
            <p className="mt-3 border border-[#b02a37] bg-[#fdf2f3] px-3 py-2 text-[12px] font-bold text-[#7a1c25]">
              {error}
            </p>
          )}

          <form onSubmit={submit}>
            <h2
              className="mt-5 border-b border-[#a8b4bf] pb-0.5 text-[15px] font-bold text-[#1c3f5f]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Add Classes Worksheet
            </h2>

            <table className="mt-2 w-full border-collapse border border-[#a8b4bf] text-[12px]">
              <thead>
                <tr>
                  <th className="w-[10%] border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                    Row
                  </th>
                  <th className="w-[30%] border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                    CRN
                  </th>
                  <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((value, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[#f6f8fa]" : undefined}>
                    <td className="border border-[#cdd6dd] px-2 py-1 text-[#55606b]">
                      {i + 1}
                    </td>
                    <td className="border border-[#cdd6dd] px-2 py-1">
                      {/* The old #8a97a3 border measured 2.98:1 on a white row
                          and 2.80:1 on a striped one, just under SC 1.4.11's 3:1
                          for a control boundary. #828f9b is 3.31:1 / 3.11:1 and
                          is indistinguishable at 1px. */}
                      <input
                        type="text"
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setRow(i, e.target.value)}
                        aria-label={`CRN row ${i + 1}`}
                        className="w-24 border border-[#828f9b] bg-white px-1.5 py-0.5 font-mono text-[12px] text-black focus:outline focus:outline-2 focus:outline-[#1c3f5f]"
                      />
                    </td>
                    <td className="border border-[#cdd6dd] px-2 py-1 text-[#55606b]">
                      {incoming[i] !== undefined && incoming[i] === value
                        ? "Prefilled from Reverse Audit cart"
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <TotalCreditHours crns={filledRows} creditsByCrn={creditsByCrn} />

            <div className="mt-3 flex items-center gap-2">
              {/* Beveled grey buttons, not shadcn. See the file header. */}
              <button
                type="submit"
                className="border border-[#6f7c88] border-t-white border-l-white bg-[#dfe4e9] px-3 py-1 text-[12px] font-bold text-black active:border-t-[#6f7c88] active:border-l-[#6f7c88] active:bg-[#cfd6dd]"
              >
                Submit Changes
              </button>
              {/* Banner sits Class Search between Submit Changes and Reset. It is
                  disabled because there is no catalog browser behind this mock,
                  and a dead button is more honest than one that goes nowhere. */}
              <button
                type="button"
                disabled
                className="cursor-not-allowed border border-[#a4adb6] border-t-white border-l-white bg-[#eceff2] px-3 py-1 text-[12px] text-[#8d97a1]"
              >
                Class Search
              </button>
              <button
                type="button"
                onClick={reset}
                className="border border-[#6f7c88] border-t-white border-l-white bg-[#dfe4e9] px-3 py-1 text-[12px] text-black active:border-t-[#6f7c88] active:border-l-[#6f7c88] active:bg-[#cfd6dd]"
              >
                Reset
              </button>
              <Link
                href="/"
                className="ml-2 inline-block py-1 text-[12px] text-[#0000cc] underline"
              >
                Return to Reverse Audit
              </Link>
            </div>
          </form>
        </>
      ) : (
        <>
          {/* The green confirmation. §13. */}
          <div
            role="status"
            className="mt-4 border-2 border-[#2f7d4f] bg-[#e6f5ec] px-3 py-2.5"
          >
            <p className="text-[13px] font-bold text-[#14532d]">
              Your changes were saved successfully.
            </p>
            <p className="mt-1 text-[12px] text-[#1c5133]">
              {registered.length}{" "}
              {registered.length === 1 ? "course was" : "courses were"} added to
              your {NEXT_TERM_LABEL} schedule on {stamp}.
            </p>
          </div>

          <h2
            className="mt-5 border-b border-[#a8b4bf] pb-0.5 text-[15px] font-bold text-[#1c3f5f]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Current Schedule
          </h2>

          <table className="mt-2 w-full border-collapse border border-[#a8b4bf] text-[12px]">
            <thead>
              <tr>
                <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                  Status
                </th>
                <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                  Action
                </th>
                <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                  CRN
                </th>
                <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                  Term
                </th>
                <th className="border border-[#cdd6dd] bg-[#dde5ec] px-2 py-1 text-left font-bold text-[#1c3f5f]">
                  Level
                </th>
              </tr>
            </thead>
            <tbody>
              {registered.map((crn, i) => (
                <tr key={crn} className={i % 2 === 1 ? "bg-[#f6f8fa]" : undefined}>
                  <td className="border border-[#cdd6dd] px-2 py-1 font-bold text-[#14532d]">
                    **Web Registered** on {stamp}
                  </td>
                  <td className="border border-[#cdd6dd] px-2 py-1 text-[#55606b]">
                    None
                  </td>
                  <td className="border border-[#cdd6dd] px-2 py-1 font-mono">
                    {crn}
                  </td>
                  <td className="border border-[#cdd6dd] px-2 py-1">
                    {NEXT_TERM_LABEL}
                  </td>
                  <td className="border border-[#cdd6dd] px-2 py-1">
                    Undergraduate
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <TotalCreditHours crns={registered} creditsByCrn={creditsByCrn} />

          <p className="mt-3 text-[12px] leading-relaxed">
            Course titles, meeting times, and instructors will appear on your
            detail schedule once the registration batch completes. Some courses
            also require a linked laboratory or recitation section &mdash; check
            your detail schedule before the add/drop deadline.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="border border-[#6f7c88] border-t-white border-l-white bg-[#dfe4e9] px-3 py-1 text-[12px] text-black active:border-t-[#6f7c88] active:border-l-[#6f7c88] active:bg-[#cfd6dd]"
            >
              Add or Drop More Classes
            </button>
            <Link href="/" className="ml-2 text-[12px] text-[#0000cc] underline">
              Return to Reverse Audit
            </Link>
          </div>
        </>
      )}
    </BannerChrome>
  );
}

/**
 * useSearchParams() suspends. Next 16 fails the build with
 * "missing-suspense-with-csr-bailout" if it is not wrapped, and the fallback is
 * what a visitor sees while the query string resolves — so it renders the same
 * chrome rather than a spinner.
 */
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <BannerChrome>
          <PageHeading />
          <p className="mt-4 text-[12px]">Loading registration worksheet&hellip;</p>
        </BannerChrome>
      }
    >
      <RegisterWorksheet />
    </Suspense>
  );
}
