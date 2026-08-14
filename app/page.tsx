"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AuditUpload, type ManualAuditEntry } from "@/components/AuditUpload";
import { DiagnosisScreen } from "@/components/DiagnosisScreen";
import { JobPostingInput } from "@/components/JobPostingInput";
import { ScheduleOptions } from "@/components/ScheduleOptions";
import { computeBottlenecks, normalizeCode } from "@/lib/bottlenecks";
import { computeSkillGaps, type DemandedSkill } from "@/lib/gaps";
import {
  buildSchedules,
  getEligibleCourses,
  unofferedCriticals,
} from "@/lib/schedules";
import { NEXT_TERM_LABEL } from "@/lib/types";
import type {
  Bottleneck,
  CatalogSkills,
  Course,
  Preferences,
  PrereqGraph,
  Requirement,
  ScheduleOption,
  SkillGap,
  StudentAudit,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The whole flow. CLAUDE.md §13: one page, four states, driven by React state.
 * No routing except /register. §5 closed the database — state lives here and
 * the catalog ships as static JSON.
 *
 * ---------------------------------------------------------------------------
 * DATA FLOW (§6). Two API calls, two local computations:
 *
 *   postings   → POST /api/extract-skills   → DemandedSkill[]
 *   audit PDF  → POST /api/parse-audit      → StudentAudit
 *   diagnosis  → computeBottlenecks + computeSkillGaps   LOCAL, no API call
 *   schedules  → buildSchedules() LOCAL, then POST /api/build-schedules
 *                for label/why/tradeoff prose ONLY — §12.3, the model never
 *                picks a course.
 *
 * §12: every route returns its cached fixture with `degraded: true` rather than
 * a 500, so no seam here needs an error screen (§0 rule 3).
 * ---------------------------------------------------------------------------
 */

type Step = "postings" | "audit" | "diagnosis" | "schedules";

const STEPS: { id: Step; label: string }[] = [
  { id: "postings", label: "Job postings" },
  { id: "audit", label: "Your audit" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "schedules", label: "Schedule" },
];

const SAMPLE_AUDIT_URL = "/sample-audit.pdf";
const SAMPLE_POSTING_URLS = [
  "/samples/sample-job-swe.txt",
  "/samples/sample-job-data.txt",
];

const defaultPreferences: Preferences = {
  lighterWorkload: false,
  noMornings: false,
  inPersonOnly: false,
};

/**
 * The committed catalog is ~850 KB across three files. A static top-level import
 * would put all of it in the first-load bundle, which fights §6's "the app feels
 * instant" goal for data nothing on screen 1 needs. A dynamic import lets
 * Turbopack split it into its own chunk that arrives while the student is typing.
 */
type Catalog = {
  courses: Course[];
  prereqs: PrereqGraph;
  catalogSkills: CatalogSkills;
};

let catalogPromise: Promise<Catalog> | null = null;

function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      import("@/data/courses.json"),
      import("@/data/prereqs.json"),
      import("@/data/catalog-skills.json"),
    ]).then(([c, p, s]) => ({
      courses: c.default as unknown as Course[],
      prereqs: p.default as unknown as PrereqGraph,
      catalogSkills: s.default as unknown as CatalogSkills,
    }));
  }
  return catalogPromise;
}

export default function Home() {
  const [step, setStep] = useState<Step>("postings");
  const [isWorking, setIsWorking] = useState(false);

  const [postings, setPostings] = useState<string[]>(["", "", ""]);
  const [demanded, setDemanded] = useState<DemandedSkill[]>([]);
  const [audit, setAudit] = useState<StudentAudit | null>(null);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [gaps, setGaps] = useState<SkillGap[]>([]);

  const [titles, setTitles] = useState<Record<string, string>>({});
  const [prereqsOf, setPrereqsOf] = useState<Record<string, string[]>>({});
  const [unoffered, setUnoffered] = useState<string[]>([]);
  const [electiveSlots, setElectiveSlots] = useState(1);

  const [options, setOptions] = useState<ScheduleOption[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [appliedPreferences, setAppliedPreferences] =
    useState<Preferences>(defaultPreferences);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Warm the catalog chunk while the student is still typing, so the diagnosis
  // transition never waits on a 850 KB download.
  useEffect(() => {
    void loadCatalog();
  }, []);

  const filledPostings = postings.filter((p) => p.trim() !== "").length;
  const furthest = audit ? (options.length ? 3 : 2) : filledPostings ? 1 : 0;

  const skillNames = useMemo(
    () => Object.fromEntries(gaps.map((g) => [g.skillId, g.skillName])),
    [gaps],
  );

  const preferencesDirty =
    JSON.stringify(preferences) !== JSON.stringify(appliedPreferences);

  // Keeps the freshest gaps available to buildSchedules without threading them
  // through a setState round trip — runDiagnosis and buildSchedules can run back
  // to back when the student clicks straight through.
  const gapsRef = useRef<SkillGap[]>([]);
  const bottlenecksRef = useRef<Bottleneck[]>([]);
  const auditRef = useRef<StudentAudit | null>(null);

  // The diagnosis screen is tall. Without this, "Build my semester" leaves the
  // viewer halfway down the next screen — which on camera reads as a broken cut.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // -- Step 1 --------------------------------------------------------------

  async function handleLoadSamples() {
    try {
      const texts = await Promise.all(
        SAMPLE_POSTING_URLS.map((u) => fetch(u).then((r) => r.text())),
      );
      setPostings([texts[0] ?? "", texts[1] ?? "", ""]);
      toast.success("Two sample postings loaded", {
        description: "Backend software engineer and data scientist.",
      });
    } catch {
      toast.error("Could not load the samples — paste a posting instead.");
    }
  }

  async function handlePostingsSubmit() {
    setIsWorking(true);
    const filled = postings.filter((p) => p.trim() !== "");
    try {
      const res = await fetch("/api/extract-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postings: filled }),
      });
      const json = (await res.json()) as {
        skills: DemandedSkill[];
        degraded: boolean;
      };
      setDemanded(json.skills ?? []);
      if (json.degraded) console.info("[extract-skills] served cached fixture");
    } catch (err) {
      console.error("[extract-skills] request failed", err);
      setDemanded([]);
    }
    setIsWorking(false);
    setStep("audit");
  }

  // -- Step 2 --------------------------------------------------------------

  /** Shared by the dropzone and the "use the sample audit" shortcut. */
  async function parseAuditPdf(file: Blob, filename: string) {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await fetch("/api/parse-audit", { method: "POST", body: form });
    const json = (await res.json()) as { audit: StudentAudit; degraded: boolean };
    if (json.degraded) console.info("[parse-audit] served cached fixture");
    return json.audit;
  }

  async function handleFile(file: File) {
    setIsWorking(true);
    try {
      await runDiagnosis(await parseAuditPdf(file, file.name));
    } catch (err) {
      console.error("[parse-audit] request failed", err);
      setIsWorking(false);
      toast.error("That file could not be read — try the manual form.");
    }
  }

  async function handleUseSample() {
    setIsWorking(true);
    try {
      const blob = await fetch(SAMPLE_AUDIT_URL).then((r) => r.blob());
      await runDiagnosis(await parseAuditPdf(blob, "sample-audit.pdf"));
    } catch (err) {
      console.error("[parse-audit] sample failed", err);
      setIsWorking(false);
      toast.error("Could not load the sample audit.");
    }
  }

  async function handleManualSubmit(entry: ManualAuditEntry) {
    setIsWorking(true);
    try {
      await runDiagnosis(await auditFromManual(entry));
    } catch (err) {
      console.error("[manual entry] failed", err);
      setIsWorking(false);
      toast.error("Could not build an audit from those details.");
    }
  }

  // -- Step 3 --------------------------------------------------------------

  async function runDiagnosis(nextAudit: StudentAudit) {
    const { courses, prereqs, catalogSkills } = await loadCatalog();

    // §11.1 and §11.2 — both local, no API call.
    const nextBottlenecks = computeBottlenecks(nextAudit, prereqs, courses);
    const nextGaps = computeSkillGaps(
      demanded,
      nextAudit,
      catalogSkills,
      prereqs,
      courses,
    );

    // Context maps the diagnosis screen renders course names and chains from.
    setTitles(
      Object.fromEntries(courses.map((c) => [normalizeCode(c.code), c.title])),
    );
    setPrereqsOf(
      Object.fromEntries(
        Object.entries(prereqs).map(([code, rule]) => [
          code,
          [...rule.allOf, ...rule.oneOf.flat()],
        ]),
      ),
    );

    // §11.3 step 1 decides registrability from SECTIONS, so a critical course
    // with no Fall 2026 section belongs on the diagnosis screen as "see your
    // advisor", never on a schedule card.
    const eligible = getEligibleCourses(
      nextAudit,
      defaultPreferences,
      courses,
      prereqs,
    );
    setUnoffered(unofferedCriticals(nextBottlenecks, eligible));

    setElectiveSlots(
      Math.max(
        1,
        nextAudit.requirements
          .filter((r) => r.status === "incomplete")
          .reduce((n, r) => n + r.slotsOpen, 0),
      ),
    );

    auditRef.current = nextAudit;
    bottlenecksRef.current = nextBottlenecks;
    gapsRef.current = nextGaps;

    setAudit(nextAudit);
    setBottlenecks(nextBottlenecks);
    setGaps(nextGaps);
    setOptions([]);
    setSelectedId(null);
    setIsWorking(false);
    setStep("diagnosis");
  }

  // -- Step 4 --------------------------------------------------------------

  async function runBuildSchedules(prefs: Preferences) {
    const currentAudit = auditRef.current;
    if (!currentAudit) return;

    setIsWorking(true);
    const { courses, prereqs, catalogSkills } = await loadCatalog();

    // §11.3 — deterministic, in TypeScript. The model does not pick courses.
    const combos = buildSchedules(
      currentAudit,
      prefs,
      gapsRef.current,
      bottlenecksRef.current,
      courses,
      prereqs,
      catalogSkills,
    );

    let next: ScheduleOption[] = [];
    try {
      const res = await fetch("/api/build-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combos,
          gaps: gapsRef.current,
          bottlenecks: bottlenecksRef.current,
          audit: currentAudit,
        }),
      });
      const json = (await res.json()) as {
        options: ScheduleOption[];
        degraded: boolean;
      };
      next = json.options ?? [];
      if (json.degraded) console.info("[build-schedules] prose written locally");
    } catch (err) {
      console.error("[build-schedules] request failed", err);
      next = [];
    }

    setOptions(next);
    setAppliedPreferences(prefs);
    setSelectedId((current) =>
      current && next.some((o) => o.id === current) ? current : null,
    );
    setIsWorking(false);
    setStep("schedules");
  }

  return (
    <main className="flex-1">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-6">
        <Stepper
          step={step}
          furthest={furthest}
          onJump={(id) => !isWorking && setStep(id)}
        />

        <div className="pt-10 pb-20 sm:pt-12">
          {step === "postings" && (
            <JobPostingInput
              postings={postings}
              onChange={(i, value) =>
                setPostings((prev) => prev.map((p, j) => (j === i ? value : p)))
              }
              onLoadSamples={handleLoadSamples}
              onSubmit={handlePostingsSubmit}
              isWorking={isWorking}
            />
          )}

          {step === "audit" && (
            <AuditUpload
              onFile={handleFile}
              onManualSubmit={handleManualSubmit}
              onUseSample={handleUseSample}
              sampleAuditUrl={SAMPLE_AUDIT_URL}
              onBack={() => setStep("postings")}
              isWorking={isWorking}
            />
          )}

          {step === "diagnosis" && audit && (
            <DiagnosisScreen
              audit={audit}
              bottlenecks={bottlenecks}
              gaps={gaps}
              titles={titles}
              prereqsOf={prereqsOf}
              postingCount={filledPostings || undefined}
              unofferedCritical={unoffered}
              onContinue={() => runBuildSchedules(preferences)}
              onBack={() => setStep("audit")}
              isWorking={isWorking}
            />
          )}

          {step === "schedules" && (
            <ScheduleOptions
              options={options}
              slotsAvailable={electiveSlots}
              skillNames={skillNames}
              preferences={preferences}
              onPreferencesChange={setPreferences}
              onRegenerate={() => runBuildSchedules(preferences)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onBack={() => setStep("diagnosis")}
              isWorking={isWorking}
              dirty={preferencesDirty}
            />
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Manual entry only collects five fields, so requirements[], catalogYear and
 * creditsRequired come from the committed BS-CS template — §13. Without that
 * merge, manual entry produces no requirements[].missing, which is the sole
 * input to §11.1 step 1, and the diagnosis screen has nothing to diagnose.
 */
async function auditFromManual(entry: ManualAuditEntry): Promise<StudentAudit> {
  const [templateModule, { courses }] = await Promise.all([
    import("@/data/degree-template.json"),
    loadCatalog(),
  ]);

  const template = templateModule.default as unknown as {
    major: string;
    catalogYear: string;
    creditsRequired: number;
    core: string[];
    electiveBuckets: { name: string; slots: number; credits: number }[];
  };

  const creditsOf = new Map(
    courses.map((c) => [normalizeCode(c.code), c.credits]),
  );
  const taken = new Set(entry.coursesTaken.map(normalizeCode));
  const missing = template.core
    .map(normalizeCode)
    .filter((code) => !taken.has(code));

  const requirements: Requirement[] = [
    {
      name: "Computer Science Core",
      status: missing.length === 0 ? "complete" : "incomplete",
      missing,
      slotsOpen: 0,
      credits: template.core.reduce(
        (n, code) => n + (creditsOf.get(normalizeCode(code)) ?? 3),
        0,
      ),
    },
  ];

  // Spend the student's stated remaining electives across the template's buckets
  // in order, so slotsOpen never exceeds what the degree actually allows.
  let remaining = Math.max(0, entry.electivesRemaining);
  for (const bucket of template.electiveBuckets) {
    const slotsOpen = Math.min(bucket.slots, remaining);
    remaining -= slotsOpen;
    requirements.push({
      name: bucket.name,
      status: slotsOpen === 0 ? "complete" : "incomplete",
      missing: [],
      slotsOpen,
      credits: bucket.credits,
    });
  }

  return {
    major: entry.major || template.major,
    catalogYear: template.catalogYear,
    creditsCompleted: entry.creditsCompleted,
    creditsRequired: template.creditsRequired,
    expectedGraduation: entry.expectedGraduation,
    coursesTaken: [...taken],
    requirements,
  };
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <ChainMark />
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            Reverse Audit
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Planning{" "}
          <span className="font-medium text-foreground">{NEXT_TERM_LABEL}</span>
        </p>
      </div>
    </header>
  );
}

/** Three nodes and two edges — the same idea PrereqChain draws at full size. */
function ChainMark() {
  return (
    <svg
      width="26"
      height="14"
      viewBox="0 0 26 14"
      aria-hidden
      className="shrink-0"
    >
      <line x1="6" y1="7" x2="11" y2="7" stroke="var(--rule)" strokeWidth="1.5" />
      <line x1="15" y1="7" x2="20" y2="7" stroke="var(--critical)" strokeWidth="1.5" />
      <circle cx="3" cy="7" r="2.5" fill="none" stroke="var(--rule)" strokeWidth="1.5" />
      <circle cx="13" cy="7" r="3" fill="var(--critical)" />
      <circle cx="23" cy="7" r="2.5" fill="none" stroke="var(--critical)" strokeWidth="1.5" />
    </svg>
  );
}

function Stepper({
  step,
  furthest,
  onJump,
}: {
  step: Step;
  furthest: number;
  onJump: (id: Step) => void;
}) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Progress" className="border-b border-rule py-4">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 sm:gap-x-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= Math.max(current, furthest);
          return (
            <li key={s.id} className="flex items-center gap-1 sm:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-4 sm:w-8",
                    i <= current ? "bg-foreground/30" : "bg-rule",
                  )}
                />
              )}
              <button
                type="button"
                disabled={!reachable || active}
                onClick={() => onJump(s.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors",
                  reachable && !active && "hover:bg-muted",
                  !reachable && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums",
                    active
                      ? "bg-foreground text-background"
                      : done
                        ? "bg-foreground/15 text-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    active
                      ? "font-medium text-foreground"
                      : reachable
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
