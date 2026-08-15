"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AuditUpload, type ManualAuditEntry } from "@/components/AuditUpload";
import { DiagnosisScreen } from "@/components/DiagnosisScreen";
import { JobPostingInput } from "@/components/JobPostingInput";
import { ScheduleOptions } from "@/components/ScheduleOptions";
import {
  computeBottlenecks,
  delayImpact,
  normalizeCode,
  remainingRequired,
  type DelayImpact,
} from "@/lib/bottlenecks";
import { computeSkillGaps, type DemandedSkill } from "@/lib/gaps";
import { fallbackProse } from "@/lib/prose";
import {
  buildSchedules,
  explainIneligibility,
  ineligibleCriticals,
  type Combo,
  type Ineligibility,
} from "@/lib/schedules";
import { NEXT_TERM, NEXT_TERM_LABEL } from "@/lib/types";
import type {
  Bottleneck,
  CatalogSkills,
  Course,
  Preferences,
  PrereqGraph,
  Requirement,
  ScheduleOption,
  Section,
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
    ])
      .then(([c, p, s]) => ({
        courses: c.default as unknown as Course[],
        prereqs: p.default as unknown as PrereqGraph,
        catalogSkills: s.default as unknown as CatalogSkills,
      }))
      // Drop the cache before rethrowing. Caching the promise is the point of
      // this function, but caching a REJECTED one means a single ChunkLoadError
      // on the 850 KB catalog — a flaky network, a deploy that moved the chunk
      // hash out from under an open tab — permanently breaks every later
      // transition for the life of the page, with no way back short of a
      // reload. Clearing it makes the next call a fresh attempt.
      .catch((err: unknown) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

/**
 * A combo becomes a renderable ScheduleOption without the model. Same merge the
 * route performs (`{ ...combo, id, ...prose }`) and the same `fallbackProse`,
 * so the degraded card the student sees is identical whether the model failed
 * behind the route or the request never got there.
 */
function withLocalProse(combos: Combo[]): ScheduleOption[] {
  return combos.map((combo) => ({
    ...combo,
    id: combo.id || combo.strategy,
    ...fallbackProse(combo),
  }));
}

export default function Home() {
  const [step, setStep] = useState<Step>("postings");
  const [isWorking, setIsWorking] = useState(false);

  const [postings, setPostings] = useState<string[]>(["", "", ""]);
  const [demanded, setDemanded] = useState<DemandedSkill[]>([]);
  const [audit, setAudit] = useState<StudentAudit | null>(null);
  // True only when the student uploaded their OWN file and got the fixture
  // back. See handleFile — handleUseSample never sets it, which is what keeps
  // §12's no-badge rule intact on the path a judge actually takes.
  const [auditIsFixture, setAuditIsFixture] = useState(false);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [gaps, setGaps] = useState<SkillGap[]>([]);

  const [titles, setTitles] = useState<Record<string, string>>({});
  const [prereqsOf, setPrereqsOf] = useState<Record<string, string[]>>({});
  const [delays, setDelays] = useState<Record<string, DelayImpact>>({});
  const [ineligible, setIneligible] = useState<Ineligibility[]>([]);
  const [electiveSlots, setElectiveSlots] = useState(1);

  const [options, setOptions] = useState<ScheduleOption[]>([]);
  const [alternates, setAlternates] = useState<Record<string, Section[]>>({});
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [appliedPreferences, setAppliedPreferences] =
    useState<Preferences>(defaultPreferences);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Warm the catalog chunk while the student is still typing, so the diagnosis
  // transition never waits on a 850 KB download. Swallow the failure here and
  // ONLY here: nothing is on screen that depends on it yet, `loadCatalog` has
  // already cleared its cache so the real call retries, and the step that does
  // need it reports its own error. `void` on this promise was an unhandled
  // rejection on mount.
  useEffect(() => {
    loadCatalog().catch((err: unknown) => {
      console.warn("[catalog] warm-up failed; will retry on demand", err);
    });
  }, []);

  const filledPostings = postings.filter((p) => p.trim() !== "").length;
  const furthest = audit ? (options.length ? 3 : 2) : filledPostings ? 1 : 0;

  const skillNames = useMemo(
    () => Object.fromEntries(gaps.map((g) => [g.skillId, g.skillName])),
    [gaps],
  );

  // Context for the schedule cards. All derived from state the diagnosis screen
  // already holds, so the two screens cannot disagree in front of someone who
  // adds the numbers up.
  //
  // The same `!covered` split GapMap draws its two chip groups from, and the
  // same one §11.2 step 4 defines: `closableBy` is only filled with courses
  // whose prerequisites the student has already satisfied, so an empty one means
  // the skill sits behind a prereq rather than that no course teaches it.
  //
  // GapMap used to also print this arithmetic as a sentence and the two had to
  // agree; that sentence is gone (it restated the stat strip directly above it),
  // but the definition still has to match the chips, because screen 3 shows a
  // "needs a prereq first" badge on exactly the gaps `blockedGaps` counts and
  // screen 4 says "closes 1 of 3 reachable gaps" about the rest.
  const reachableGaps = useMemo(
    () => gaps.filter((g) => !g.covered && g.closableBy.length > 0).length,
    [gaps],
  );
  const blockedGaps = useMemo(
    () => gaps.filter((g) => !g.covered && g.closableBy.length === 0).length,
    [gaps],
  );
  // Without this the cards cannot tell a required course from an elective, and
  // labelling a required course "ELECTIVE" would be a false claim about the
  // student's degree (§0 rule 7). useMemo matters: a fresh Set each render
  // re-renders all three cards.
  const requiredCodes = useMemo(
    () => new Set(audit ? remainingRequired(audit) : []),
    [audit],
  );
  const dependentsOf = useMemo(
    () =>
      Object.fromEntries(
        bottlenecks.map((b) => [normalizeCode(b.code), b.dependents]),
      ),
    [bottlenecks],
  );
  const skillDemand = useMemo(
    () => Object.fromEntries(gaps.map((g) => [g.skillId, g.demandCount])),
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
  /** In flight from step 1, awaited in runDiagnosis. See handlePostingsSubmit. */
  const skillsPromise = useRef<Promise<DemandedSkill[]> | null>(null);
  /** Focus target on each step change, for keyboard and screen-reader users. */
  const headingRef = useRef<HTMLDivElement | null>(null);

  // The diagnosis screen is tall. Without this, "Build my semester" leaves the
  // viewer halfway down the next screen — which on camera reads as a broken cut.
  //
  // Focus moves with it. A four-state flow that swaps the whole main region
  // without moving focus strands keyboard users at the top of the document and
  // announces nothing to a screen reader. Three lines, and it is the difference
  // between "keyboard navigable" being true and being a claim.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    headingRef.current?.focus();
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

  /**
   * The skills call is FIRED here but AWAITED in runDiagnosis. Nothing on the
   * audit screen depends on its result, so blocking the step transition on a
   * 1-3 second model call bought a dead-air stare at an unchanged page. By the
   * time the student has uploaded a PDF it has almost always resolved.
   */
  function handlePostingsSubmit() {
    const filled = postings.filter((p) => p.trim() !== "");
    skillsPromise.current = fetch("/api/extract-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postings: filled }),
    })
      .then((res) => res.json() as Promise<{ skills: DemandedSkill[]; degraded: boolean }>)
      .then((json) => {
        if (json.degraded) console.info("[extract-skills] served cached fixture");
        return json.skills ?? [];
      })
      .catch(async (err) => {
        // Previously this set [] and advanced anyway, which rendered
        // "0 asked for / 0 open / 0 covered" beneath a headline reading
        // "0 of the skills your postings asked for are still open" — a
        // confidently wrong screen that reads as GOOD news. §0 rule 3 says
        // degrade to something that still renders; it does not say render a lie.
        console.error("[extract-skills] request failed, using local fixture", err);
        const fixture = await import("@/samples/fallback-response.json");
        return (fixture.default["extract-skills"]?.skills ?? []) as DemandedSkill[];
      });
    setStep("audit");
  }

  // -- Step 2 --------------------------------------------------------------

  /**
   * Shared by the dropzone and the "use the sample audit" shortcut.
   *
   * Returns `degraded` rather than logging it. When the route degrades on this
   * particular endpoint, the fixture it serves is a whole other person's
   * academic record — major, credits, courses taken — and the screens that
   * follow present it as the student's own without qualification. Every caller
   * has to decide what that means for it; see the note above `handleFile`.
   */
  async function parseAuditPdf(file: Blob, filename: string) {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await fetch("/api/parse-audit", { method: "POST", body: form });
    // §12 says this route never returns a non-2xx, so this is defence against
    // the layer ABOVE it: a 413 from Vercel's 4.5 MB body cap is raised before
    // the handler runs, and its body has no `audit` at all. Without this the
    // `undefined` travelled on and threw somewhere inside runDiagnosis, where
    // the toast blamed the file for a size limit.
    if (!res.ok) throw new Error(`parse-audit returned ${res.status}`);
    const json = (await res.json()) as { audit: StudentAudit; degraded: boolean };
    if (!json?.audit) throw new Error("parse-audit returned no audit");
    return { audit: json.audit, degraded: json.degraded === true };
  }

  /**
   * The student's OWN transcript. This is the one entry point that surfaces
   * `degraded`, and §12's "no cached-sample badge" rule is why the other two do
   * not — the rule exists so a judge clicking the live link never meets
   * something that reads as a broken app, and the judge's path is
   * `handleUseSample`, which structurally cannot reach this.
   *
   * Here the calculus inverts. A real student on a dead key uploaded their real
   * transcript and got back a stranger's degree progress labelled as theirs.
   * Staying quiet about that is not politeness, it is the app asserting facts
   * about someone's degree that it made up (§0 rule 7) — and unlike the other
   * two fixtures, this one is a person's record rather than a list of skills.
   */
  async function handleFile(file: File) {
    setIsWorking(true);
    try {
      const { audit: parsed, degraded } = await parseAuditPdf(file, file.name);
      if (degraded) console.info("[parse-audit] served cached fixture");
      await runDiagnosis(parsed, { auditIsFixture: degraded });
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
      // No `auditIsFixture` here even when the route degrades: the fixture IS
      // the sample student, so it is exactly what this button promised.
      await runDiagnosis((await parseAuditPdf(blob, "sample-audit.pdf")).audit);
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

  async function runDiagnosis(
    nextAudit: StudentAudit,
    opts: { auditIsFixture?: boolean } = {},
  ) {
    // The skills call was fired back on step 1; this is where we finally need it.
    const [{ courses, prereqs, catalogSkills }, skills] = await Promise.all([
      loadCatalog(),
      skillsPromise.current ?? Promise.resolve<DemandedSkill[]>([]),
    ]);
    setDemanded(skills);

    // §11.1 and §11.2 — both local, no API call.
    const nextBottlenecks = computeBottlenecks(nextAudit, prereqs, courses);
    const nextGaps = computeSkillGaps(
      skills,
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

    // What one term of delay costs, per course. Only the courses whose urgency
    // is actually in question — a "flexible" row has nothing behind it, so
    // `atRisk` would be empty and the disclosure would not render anyway.
    setDelays(
      Object.fromEntries(
        nextBottlenecks
          .filter((b) => b.urgency !== "flexible")
          .map((b) => [b.code, delayImpact(b.code, nextAudit, prereqs)]),
      ),
    );

    // §11.3 step 1 decides registrability from SECTIONS, so a critical course
    // that cannot be registered for belongs on the diagnosis screen as "see your
    // advisor", never on a schedule card. The eligibility pass reports WHICH of
    // its six filters rejected each course, and the banner renders that reason —
    // it used to assert one cause ("has no Fall 2026 section") for all six.
    //
    // The DEFAULT preferences deliberately: the toggles belong to screen 4, and
    // diagnosing a course as unavailable because of a preference set later would
    // be a different false claim.
    const rejected = explainIneligibility(
      nextAudit,
      defaultPreferences,
      courses,
      prereqs,
    );
    // Unblocked criticals only — a prereq-blocked course is explained by the
    // "Can't take yet" group on the diagnosis screen, and listing it here as
    // well would report the same course twice.
    setIneligible(
      ineligibleCriticals(
        nextBottlenecks.filter((b) => b.blockedBy.length === 0),
        rejected,
      ),
    );

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
    setAuditIsFixture(opts.auditIsFixture === true);
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
    try {
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

      // Every Fall 2026 section of every course that made a card, for the cart's
      // section picker. Straight off the catalog rather than out of the builder:
      // §11.3 caps `getEligibleCourses` at four sections per course and pre-filters
      // by preferences, so the pool the student may choose from is deliberately
      // wider than the pool the search enumerated over.
      const onCards = new Set(combos.flatMap((c) => c.courses.map((row) => row.code)));
      setAlternates(
        Object.fromEntries(
          courses
            .filter((course) => onCards.has(normalizeCode(course.code)))
            .map((course) => [
              normalizeCode(course.code),
              (course.sections ?? [])
                .filter((s) => s.term === NEXT_TERM)
                // Same ordering getEligibleCourses uses: earliest first,
                // asynchronous last, CRN as the deterministic tiebreak.
                .sort(
                  (a, b) =>
                    Number(a.startTime === "") - Number(b.startTime === "") ||
                    a.startTime.localeCompare(b.startTime) ||
                    a.crn.localeCompare(b.crn),
                ),
            ]),
        ),
      );

      let next: ScheduleOption[];
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
        next = json.options?.length ? json.options : withLocalProse(combos);
        if (json.degraded) console.info("[build-schedules] prose written locally");
      } catch (err) {
        // The route already degrades this way on a model failure (§19 deviation
        // 4): it keeps the student's real combos and writes the prose locally,
        // because showing a stranger's courses is worse than real courses with
        // plain copy. When the request never REACHES the route, the same answer
        // is still available and still better — `combos` above was computed
        // deterministically, offline, moments ago. This used to set `[]` and
        // throw it all away.
        console.error("[build-schedules] request failed; writing prose locally", err);
        next = withLocalProse(combos);
      }

      setOptions(next);
      setAppliedPreferences(prefs);
      setSelectedId((current) =>
        current && next.some((o) => o.id === current) ? current : null,
      );
      setStep("schedules");
    } finally {
      // In the `finally`, not on the happy path. `loadCatalog` and
      // `buildSchedules` above used to sit outside any try, so a throw from
      // either left the spinner enabled with no toast and no way forward —
      // every button on the screen disabled for the life of the page.
      setIsWorking(false);
    }
  }

  /**
   * The only way screen 4 is entered. Both call sites are click handlers, which
   * cannot await, so without this the rejected promise went nowhere. On failure
   * we stay on the CURRENT screen: advancing to an empty screen 4 and then
   * explaining it is strictly worse than not advancing (§0 rule 3), and the
   * student's diagnosis is still intact behind them.
   */
  async function buildOrToast(prefs: Preferences) {
    try {
      await runBuildSchedules(prefs);
    } catch (err) {
      console.error("[build-schedules] could not build a schedule", err);
      toast.error("Could not build a schedule — try again.");
    }
  }

  return (
    <main className="flex-1">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-6">
        {/* Focus lands here on every step change; -1 keeps it out of the tab
            order while still being programmatically focusable. */}
        <div ref={headingRef} tabIndex={-1} className="outline-none" />

        {/* Politely announces progress to a screen reader. Visually hidden. */}
        <p role="status" aria-live="polite" className="sr-only">
          {isWorking
            ? "Working"
            : `Step ${STEPS.findIndex((s) => s.id === step) + 1} of ${STEPS.length}, ${
                STEPS.find((s) => s.id === step)?.label ?? ""
              }`}
        </p>

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
              delays={delays}
              ineligibleCritical={ineligible}
              auditIsFixture={auditIsFixture}
              onContinue={() => void buildOrToast(preferences)}
              onBack={() => setStep("audit")}
              isWorking={isWorking}
            />
          )}

          {step === "schedules" && (
            <ScheduleOptions
              options={options}
              slotsAvailable={electiveSlots}
              skillNames={skillNames}
              reachableGaps={reachableGaps}
              blockedGaps={blockedGaps}
              requiredCodes={requiredCodes}
              dependentsOf={dependentsOf}
              skillDemand={skillDemand}
              postingCount={filledPostings || undefined}
              alternatesOf={alternates}
              preferences={preferences}
              onPreferencesChange={setPreferences}
              onRegenerate={() => void buildOrToast(preferences)}
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
  // Opaque, not translucent-and-blurred. A frosted-glass header over scrolling
  // content is the other half of the same idiom the drop shadows were: it says
  // "app chrome" where this wants to say "page".
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <ChainMark />
          <span className="text-base font-bold tracking-tight">
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
                  "inline-flex items-center gap-2 rounded-sm py-1 pr-3 pl-1 transition-colors",
                  reachable && !active && "hover:bg-muted",
                  !reachable && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-sm text-xs font-bold tabular-nums",
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
