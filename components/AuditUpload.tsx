"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * State 2 - CLAUDE.md §13. Dropzone, a "download a sample audit" link, and a
 * collapsed manual-entry fallback that must be completable in ~20 seconds.
 *
 * The size and MIME check here is load-bearing, not politeness. §12.1: Vercel
 * caps request bodies at 4.5 MB at the infrastructure level, so an oversized
 * file returns a raw 413 that never reaches the route handler, so the route's
 * try/catch and its degraded fixture structurally cannot cover it. The only
 * place this can be caught is before the fetch.
 *
 * WHAT CHANGED IN THE UX PASS:
 *
 * 1. THE DROPZONE IS UNMISTAKABLY THE PRIMARY ACTION. "Choose a file" now holds
 *    the one filled treatment on this screen and "Use the sample audit" steps
 *    down to outline. Previously the only filled button on the screen was the
 *    sample shortcut in the side column, which told a student with an actual
 *    audit in hand that the side column was the main path.
 * 2. THE HELP TEXT INSIDE THE DROPZONE MOVED BEHIND A DISCLOSURE. Four stacked
 *    lines of instruction were competing with the button they were explaining.
 *    The portal path is kept exactly as written, one click away.
 * 3. THE PRIVACY PARAGRAPH IS DEMOTED, NOT CUT. It is a claim a data-processing
 *    audience will check, so it stays on screen, verbatim in substance, at a
 *    smaller size so it stops being the second-largest thing on the page.
 * 4. The em-dash in it is gone (stack rule). Same clause, plain punctuation.
 */

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

/**
 * What manual entry collects. §13: the remaining fields — requirements[],
 * catalogYear, creditsRequired — are filled from data/degree-template.json by
 * the caller, because requirements[].missing is the sole input to §11.1 step 1
 * and manual entry cannot produce it on its own.
 */
export interface ManualAuditEntry {
  major: string;
  creditsCompleted: number;
  expectedGraduation: string | null;
  coursesTaken: string[];
  electivesRemaining: number;
}

export interface AuditUploadProps {
  onFile: (file: File) => void;
  onManualSubmit: (entry: ManualAuditEntry) => void;
  /** Skips the upload entirely and analyses the committed sample student. */
  onUseSample: () => void;
  sampleAuditUrl: string;
  onBack?: () => void;
  isWorking?: boolean;
}

export function AuditUpload({
  onFile,
  onManualSubmit,
  onUseSample,
  sampleAuditUrl,
  onBack,
  isWorking = false,
}: AuditUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That isn't a PDF", {
        description: "Export your audit as a PDF, or enter it manually below.",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That file is too large", {
        description: `Uploads are capped at 4.5 MB. Yours is ${(
          file.size /
          1024 /
          1024
        ).toFixed(1)} MB.`,
      });
      return;
    }
    onFile(file);
  }

  return (
    <section className="animate-in fade-in duration-500">
      <header className="max-w-2xl">
        <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          One file and you&rsquo;re done.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">
          We read what you still need, not your grades.
        </p>
        {/*
          This paragraph used to end "nothing here leaves this session", which
          was FALSE: §12.1 posts the extracted text to OpenAI. A degree audit is
          a FERPA education record and the judging audience signs data-processing
          agreements for a living, so an inaccurate privacy claim is far more
          damaging here than an honest third-party disclosure. §6 guarantees the
          second half ("Persistence: None"), so every clause below is defensible
          under questioning.

          It is SMALLER now, not shorter: the claim is unchanged and still on
          screen at rest, it has simply stopped being the second-biggest thing
          on the page. The only edit is the em-dash, which the stack rules ban.
        */}
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The text goes to OpenAI to pull those requirements out, and that is
          it. No account, no database, nothing stored.
        </p>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
            dragging
              ? "border-brand bg-brand-soft"
              : "border-foreground/25 bg-card hover:border-foreground/40",
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Upload className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="mt-4 text-lg font-medium">Drop your degree audit here</p>
          {/* The one filled control on this screen. §13's sample shortcut used
              to hold it, which pointed a student with a real audit at the side
              column. */}
          <Button
            size="lg"
            className="mt-4 h-11 px-5 text-[0.9375rem]"
            disabled={isWorking}
            onClick={() => inputRef.current?.click()}
          >
            {isWorking ? "Reading your audit…" : "Choose a file"}
          </Button>
          {/*
            Stellic leads deliberately: George Mason's own degree audit runs on
            Stellic (registrar.gmu.edu calls it "Mason Degree Audit"), so it is
            the export our demo student actually has. Listing DegreeWorks first
            was a §0 rule 7 error about the judges' own customer.
          */}
          <p className="mt-4 text-sm text-muted-foreground">
            PDF, up to 4.5 MB. Stellic, DegreeWorks and Banner exports all work.
          </p>
          {/* The portal path, kept exactly as written, one click away instead
              of a fourth line of instruction under the button. */}
          <details className="mt-1 text-xs">
            <summary className="inline-flex min-h-7 cursor-pointer items-center rounded px-1.5 py-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              Where do I find this?
            </summary>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Student portal → Student Services → Degree Evaluation → print to
              PDF.
            </p>
          </details>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            // sr-only, but still a real form control in the tree, so axe flags
            // it critical under WCAG 4.1.2 without an accessible name. The
            // visible "Choose a file" button is what people click; a screen
            // reader that lands on the input directly needs this.
            aria-label="Choose your degree audit PDF"
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="text-sm font-medium">Don&rsquo;t have one?</p>
                {/*
                  86, not 89. The credit count used to disagree three ways:
                  samples/fallback-response.json said 86, samples/sample-audit.html
                  said 84, and this file said 89. 86 is now the one number, and it
                  is the number the sample PDF actually parses to. "Junior" is
                  consistent with it: 86 credits is junior standing (60-89).
                */}
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  A transfer junior in CS, 86 credits done.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Outline, not filled: the dropzone is the primary action on
                  this screen. Still the first control in the side column and
                  still the fastest path for a judge. */}
              <Button
                variant="outline"
                size="lg"
                className="h-10 px-4"
                disabled={isWorking}
                onClick={onUseSample}
              >
                Use the sample audit
                <ArrowRight aria-hidden data-icon="inline-end" />
              </Button>
              <a
                href={sampleAuditUrl}
                download
                className="inline-flex h-8 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Download className="size-3.5" aria-hidden />
                Download the PDF
              </a>
            </div>
          </div>

          <div className="rounded-xl bg-card ring-1 ring-foreground/10">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              aria-expanded={manualOpen}
              className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-muted/60"
            >
              Or enter it manually
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  manualOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {manualOpen && (
              <ManualEntry
                onSubmit={onManualSubmit}
                disabled={isWorking}
              />
            )}
          </div>
        </div>
      </div>

      {onBack && (
        <div className="mt-8 border-t border-rule pt-6">
          <Button variant="ghost" size="lg" onClick={onBack} disabled={isWorking}>
            <ArrowLeft aria-hidden data-icon="inline-start" />
            Back to postings
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * The ~20-second path. Every field is prefilled with something plausible so a
 * real student without a PDF edits rather than types.
 *
 * The defaults ARE the sample student, deliberately. Submitting them unchanged
 * reproduces the same audit the "Use the sample audit" button produces:
 * auditFromManual() in app/page.tsx subtracts this course list from
 * data/degree-template.json, which leaves exactly the eight-course `missing`
 * list in samples/fallback-response.json, and spends "3" across the template's
 * elective buckets for the same 3 open slots §11.3 step 3 sums. So the two entry
 * paths cannot tell the student two different stories.
 *
 * Credits completed is 86, the single reconciled number. This field said 89
 * while the fixture said 86 and the sample PDF said 84.
 */
function ManualEntry({
  onSubmit,
  disabled,
}: {
  onSubmit: (entry: ManualAuditEntry) => void;
  disabled: boolean;
}) {
  const [major, setMajor] = useState("Computer Science, BS");
  const [creditsCompleted, setCreditsCompleted] = useState("86");
  const [expectedGraduation, setExpectedGraduation] = useState("2027-05");
  const [electivesRemaining, setElectivesRemaining] = useState("3");
  const [courses, setCourses] = useState<string[]>([
    "CS 110",
    "CS 112",
    "CS 211",
    "CS 310",
    "MATH 113",
    "MATH 114",
    "MATH 125",
    "MATH 203",
    "MATH 213",
    "STAT 344",
    "ENGH 302",
  ]);
  const [draft, setDraft] = useState("");

  function addCourse(raw: string) {
    // Normalise to "DEPT NNN" on write, never on read — CLAUDE.md §9.1. The
    // non-breaking space is stripped FIRST: a student pasting straight out of
    // the GMU catalog brings U+00A0 between subject and number, and every regex
    // after it fails silently if it survives.
    const code = raw
      .replace(/ /g, " ")
      .trim()
      .toUpperCase()
      .replace(/^([A-Z]{2,4})\s*[- ]?\s*(\d{3})$/, "$1 $2");
    if (!/^[A-Z]{2,4} \d{3}$/.test(code)) return;
    setCourses((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setDraft("");
  }

  return (
    <div className="space-y-5 border-t border-rule px-5 pt-5 pb-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Major">
          <Input value={major} onChange={(e) => setMajor(e.target.value)} />
        </Field>
        <Field label="Credits completed">
          <Input
            inputMode="numeric"
            value={creditsCompleted}
            onChange={(e) => setCreditsCompleted(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Expected graduation">
          <Input
            type="month"
            value={expectedGraduation}
            onChange={(e) => setExpectedGraduation(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Elective slots left">
          <Input
            inputMode="numeric"
            value={electivesRemaining}
            onChange={(e) => setElectivesRemaining(e.target.value)}
            className="tabular-nums"
          />
        </Field>
      </div>

      <Field label="Courses taken">
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2">
          {courses.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-0.5 rounded-md bg-muted py-0.5 pr-0.5 pl-2 font-mono text-xs"
            >
              {c}
              {/* size-6 is the WCAG 2.2 SC 2.5.8 floor. This was a bare 12px
                  icon, which no thumb can hit. */}
              <button
                type="button"
                aria-label={`Remove ${c}`}
                onClick={() => setCourses((prev) => prev.filter((x) => x !== c))}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            value={draft}
            placeholder={courses.length ? "Add another…" : "CS 211"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCourse(draft);
              } else if (e.key === "Backspace" && draft === "") {
                setCourses((prev) => prev.slice(0, -1));
              }
            }}
            onBlur={() => addCourse(draft)}
            className="min-w-24 flex-1 bg-transparent px-1 py-1 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
          />
        </div>
      </Field>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Your remaining requirements come from the published BS Computer Science
        template, minus what you list here.
      </p>

      <Button
        className="w-full"
        size="lg"
        disabled={disabled || courses.length === 0}
        onClick={() =>
          onSubmit({
            major: major.trim(),
            creditsCompleted: Number(creditsCompleted) || 0,
            expectedGraduation: /^\d{4}-\d{2}$/.test(expectedGraduation)
              ? expectedGraduation
              : null,
            coursesTaken: courses,
            electivesRemaining: Number(electivesRemaining) || 0,
          })
        }
      >
        Run the diagnosis
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
