// Reverse Audit — FROZEN DATA CONTRACTS
//
// See CLAUDE.md §8. Two people build against this file in parallel. Changing a
// type here blocks the other person — if a contract genuinely needs to change,
// say so explicitly and loudly. Do not silently adapt.

// ---------- Catalog ----------

export type Term = "fall" | "spring" | "summer";

// Fall 2026 is the ONLY term in Banner not marked "(View only)" — the only term
// with live, registerable sections. Spring 2027 will not publish before Aug 21.
// Registration runs Apr 14 – Aug 31, 2026, so a judge opening the link on Aug 21
// can verify a CRN is real AND still registerable. That is a true line for camera.
export const NEXT_TERM: Term = "fall";
export const NEXT_TERM_LABEL = "Fall 2026";
export const NEXT_TERM_BANNER_CODE = "202670";

export interface Section {
  crn: string;
  days: string; // "MW", "TR", "F". "" for asynchronous.
  startTime: string; // "13:30" 24h. "" for asynchronous.
  endTime: string; // "14:45". "" for asynchronous.
  instructor: string;
  modality: "in-person" | "online" | "hybrid";
  term: Term; // AUTHORITATIVE for registrability. You cannot register without a
  // CRN, so §11.3 eligibility is decided by sections, NEVER by
  // Course.termsOffered.
}

export interface Course {
  code: string; // "CS 484" — canonical, always "DEPT NNN", single ASCII space
  title: string;
  credits: number;
  description: string;
  prereqText: string; // raw text, exactly as the catalog wrote it
  termsOffered: Term[]; // OBSERVED from sampled Banner terms. Drives
  // offeringPenalty ONLY, never registrability. Summer is
  // never plannable. Never [] — default to ["fall","spring"]
  // for any course not seen in a sample, because [] silently
  // deletes the course from §11.3's `eligible` set.
  everyOtherYear: boolean; // ALWAYS false. Three terms of observation cannot
  // establish an alternate-year pattern. Field kept so the
  // frozen contract does not move; never set true.
  majorRestriction?: string | null; // from catalog `p.maj`. 14 of 103 CS courses
  // carry one. Optional + additive so mocks keep compiling.
  sections: Section[];
}

// ---------- Prereqs ----------

export interface PrereqRule {
  allOf: string[]; // every one required
  oneOf: string[][]; // each inner array = pick one from this group
  minGrade: string | null; // "C", "B-", null. Extracted but UNCONSUMABLE:
  // StudentAudit.coursesTaken carries no grades. The UI must
  // therefore say "prereq courses completed", never "all
  // prereqs met". See CLAUDE.md §13.
  coreq: string[];
}

export type PrereqGraph = Record<string, PrereqRule>;

// ---------- Skills ----------

// NAMING RULE, no exceptions: skill fields are always skillId / skillName.
// Course fields are always code / title. This applies to API payloads too.
export interface Skill {
  skillId: string; // O*NET DWA id, e.g. "4.A.2.b.2.I01.D01"
  skillName: string;
}

// course code → skills it teaches, with match confidence 0–1
export type CatalogSkills = Record<
  string,
  { skillId: string; score: number }[]
>;

// ---------- Student ----------

export interface Requirement {
  name: string; // "CS Core", "CS Elective"
  status: "complete" | "incomplete";
  missing: string[]; // specific required course codes still needed
  slotsOpen: number; // for elective buckets; 0 for named requirements
  credits: number;
}

export interface StudentAudit {
  major: string;
  catalogYear: string | null; // NULLABLE. Strict mode requires every field in
  creditsCompleted: number; //   `required`, so a non-nullable string here forces
  creditsRequired: number; //   the model to invent one.
  expectedGraduation: string | null; // "2027-12"; pattern ^\d{4}-\d{2}$
  coursesTaken: string[]; // ["CS 262", "CS 310"]
  requirements: Requirement[];
}

// When expectedGraduation is null, lib/bottlenecks.ts falls back to
//   termsRemaining = Math.max(1, Math.ceil((creditsRequired - creditsCompleted) / 15))

// ---------- Analysis output ----------

export interface Bottleneck {
  code: string;
  title: string;
  chainDepth: number; // longest dependent path behind it, IN EDGES (a leaf is 0)
  dependents: string[]; // transitive set of still-needed courses reachable from
  // this one. dependents.length >= chainDepth, always.
  termsOffered: Term[];
  termsRemaining: number; // integer count of fall+spring terms
  // ADDITIVE, Aug 15. §11.1 reasoned downstream only: chainDepth answers "what is
  // waiting behind this course" and nothing asked whether the student can START
  // it. That put CS 367 under "Take this term or next" while its own prerequisite
  // CS 262 was still unmet — an option that does not exist. These two carry the
  // upstream half.
  blockedBy: string[]; // immediate unmet prereqs, sorted. [] = registrable next term
  termsUntilEligible: number; // terms until it can first be taken. 0 = next term
  urgency: "critical" | "soon" | "flexible";
  reason: string; // human-readable, shown in UI
}

export interface SkillGap {
  skillId: string;
  skillName: string;
  demandCount: number; // how many of the pasted jobs wanted it
  coveredBy: string[]; // already-taken or still-required courses covering it
  covered: boolean; // coveredBy.length > 0
  closableBy: string[]; // course codes that would close it (only when !covered)
}

export interface ScheduleOption {
  id: string; // = strategy
  strategy: "max-coverage" | "balanced" | "keeps-options-open";
  label: string; // "Close the data gap" — written by OpenAI
  courses: {
    code: string;
    title: string;
    section: Section;
    isBottleneck: boolean;
    skillsClosed: string[];
    rmpUrl: string;
  }[];
  totalCredits: number;
  bottlenecksCleared: number;
  gapsClosed: number;
  gapsTotal: number;
  slotsUsed: number;
  conflicts: string[]; // [] by construction — §11.3 step 5 only emits
  // conflict-free combos. Field kept rather than moving a
  // frozen contract.
  why: string; // one sentence, written by OpenAI
  tradeoff: string; // one sentence, written by OpenAI
}

export interface Preferences {
  lighterWorkload: boolean;
  noMornings: boolean; // no section starting before 10:00
  inPersonOnly: boolean;
}
