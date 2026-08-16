@AGENTS.md

# CLAUDE.md — Reverse Audit

> This file is the single source of truth for this project. Read it fully before
> writing code. Section 5 lists decisions that are already made and closed — do
> not propose alternatives to those unless something has actually broken.
>
> **Revised Aug 13, 2026** after a full adversarial audit (six independent
> auditors + verification pass). Everything marked ✅ VERIFIED was fetched live
> and confirmed, not assumed. See §18 for what changed and why.

---

## 0. HOW TO WORK ON THIS PROJECT

**Context:** This is an 8-day hackathon build with a hard deadline. Two people. Nothing exists yet.

**Rules of engagement:**

1. **Ship over architect.** No abstraction layers, no repository pattern, no dependency injection. Plain functions in plain files. This code will be read by judges once and then never maintained.
2. **The data contracts in §8 are frozen.** Two people build against them in parallel. Changing a type means blocking the other person. If a contract genuinely needs to change, say so explicitly and loudly — don't silently adapt.
3. **Never break the demo path.** Every feature must degrade to something that still renders. If the audit PDF fails to parse, show the cached fixture. If the OpenAI call fails, show cached sample output. A blank screen in the demo video is worse than a mediocre feature.
4. **Real data over invented data.** See §10. If you're tempted to hardcode a course list, don't — scrape it.
5. **Ask before scope.** If a task looks like it will take more than half a day, flag it before starting.
6. When you finish a task, state plainly what works and what doesn't. Don't say "implemented" for something you haven't run.
7. **Any course code, title, or offering claim written into a mockup must be one you have checked against the live catalog or Banner.** Mockup strings become component defaults. A wrong domain claim in front of registrars reads as not knowing the domain, which is worse than a bug — a bug reads as a hackathon artifact.

---

## 1. STATUS

- **Today:** August 13, 2026 (Thursday). **Deadline: August 21, 2026, 11:59 p.m. ET** (Friday). **8 working days, and Bao is at half capacity through Aug 14.**
- **Target term for the product:** Fall 2026, Banner term code `202670`. ✅ VERIFIED as the only term with live registerable sections.
- **Built so far:** nothing. Day 1 is repo setup (see §14).
- **Name:** "Reverse Audit" is provisional.
- **Team:** 2 people. Bao (data pipeline + API routes), teammate (UI + demo assets).
- **Constraint:** Bao has a separate hackathon due Aug 14. Days 1–2 are half-capacity for him.
- **API:** OpenAI (we have leftover credits). Not Anthropic. See §6.

---

## 2. WHAT WE'RE BUILDING

**One-liner:** Tell it the job you want. The AI builds your whole next semester — required courses in the right order, electives that close your skill gaps — and hands you the cart.

### The two problems

**1. Sequencing.** A degree plan tells you what's left. It doesn't tell you which boxes are *load-bearing* — which required course sits at the head of a four-course chain, is constrained in when it's offered, and will cost you a full year if you miss it this term — or which of them an employer is actually asking for. Students discover this by accident, usually too late.

> Note the change from "a degree audit shows requirements as a flat checklist."
> Stellic's own product is not a flat checklist, and this sentence gets spoken
> out loud to Stellic. See §4.

**2. Choosing.** Nothing tells you what to do with the handful of electives you actually get to pick. Those slots are the only real decision a student makes in four years, and they get filled based on what fits the schedule and what a friend said was easy.

### Who it's for

Any undergrad picking classes for next term. Especially first-generation and transfer students who don't have someone in their life telling them that electives are a lever, or that a course sitting at the head of a chain is a bottleneck.

### Why it matters (use these numbers in the write-up)

- 52% of college graduates are underemployed within a year of graduating; 45% are still underemployed a decade later. — *Talent Disrupted*, Strada Institute for the Future of Work and the Burning Glass Institute, February 2024. **Cite it by name.**
- Institutions offer required courses when students need them only about 15% of the time; 57% of students spend extra time and money as a result. — Ad Astra 2024 Benchmark Report (1.3M students). **Cite it by name** — some judges are Ad Astra customers.
- A prereq missed in fall, when that course is constrained in when it's offered, pushes an entire downstream sequence back a full year.

> **Every number that goes on camera or into the write-up must be re-opened at
> its cited source on Aug 20 and confirmed verbatim.** These were fact-checked
> in the Aug 13 audit, but a statistic you cannot defend in the room is worse
> than no statistic.

---

## 3. THE COMPETITION

**Stellic Pathfinders Challenge** — https://www.stellic.com/pathfinders

- **Registration:** REQUIRED, free, and open through the deadline (so nothing can be missed — but the submit form is gated behind "Already registered? Submit now"). **Both teammates register at https://www.stellic.com/pathfinders with .edu addresses before writing any code.** Tooling-credit selection and the Summit delegate/conflict fields are on that form. Name the delegate there and flag any Sept 23 conflict — 30 seconds, done on the form anyway.
- **Deadline:** August 21, 2026, 11:59 p.m. ET. GMU is in ET, so no conversion risk. Confirm the exact cutoff on the submit form when you register.
- **Where to submit:** self-hosted at https://www.stellic.com/pathfinders. There is no Devpost and no Luma.
- **Category:** 04 — College to Career. *(01 — Degree Planning & Discovery is a live alternative: §15 calls the prereq/bottleneck graph "the most original thing in the build," which is squarely a 01 feature. Only four $500 category slots exist and the choice locks at the deadline. Settle it in five minutes on Aug 21, once the demo exists, based on what the finished build leads with.)*
- **Must be built new** within the July 20 – Aug 21 window
- **Deliverables:** title + category; write-up **≤500 words**; demo video **≤2:00**, **publicly hosted** on YouTube/Vimeo/Loom (a private or sign-in-gated Loom fails); a working link a judge can open — "a live URL, Figma prototype, or public GitHub repository," so **the Vercel URL satisfies this on its own and the repo may stay private**; and a list of every tool used. **No open-source license is required for our own code** — the only license obligation is compliance with and attribution of third-party OSS. Verify the published video and the Vercel URL in an incognito window before submitting.
- **Judging — five equally weighted criteria:**
  1. Does it solve a real student problem
  2. Originality
  3. Potential impact at scale
  4. Design and experience
  5. How well it's built
- **Prizes:** $5,000 grand · $2,500 × 2 runners-up · $500 × 4 category winners. Top three present at Stellic Summit, September 23, Philadelphia.

**Critical context about the audience:** Stellic is a degree-planning company and the Summit is a gathering of their partner colleges. **The finalist audience is registrars and provosts, not VCs.** Every design decision should be defensible to someone who runs a registrar's office.

Because "list every tool used" is a submission requirement, create `TOOLS.md` on day 1 and append as you go — do not reconstruct it on day 7. It lists every framework, library and model **AND every AI coding assistant used to build this (Claude Code / Cursor / Copilot)**, not just the runtime OpenAI models. Listing gpt-4o and text-embedding-3-small while omitting the assistant that wrote the project is precisely what "every tool you used" covers. We are using OpenAI rather than the Anthropic credits offered by the challenge; that is explicitly fine — tooling-partner products are optional — just disclose it accurately.

**Do not prepare Summit material before Aug 21.** It is a September contingency that only exists if you are a finalist, which is decided entirely by the Aug 21 submission.

---

## 4. COMPETITIVE LANDSCAPE

> ⚠️ Three claims in the original version of this table were **false** and would
> have been said out loud to the company being pitched. Corrected below.

| Product | What it does | Why we're not that |
|---|---|---|
| Legacy degree audit (DegreeWorks, Banner) | A flat checklist of requirements | We show which requirements are *urgent* and which can wait |
| **Stellic Progress** | Real-time audit **plus** multi-year planning, what-if scenarios, and Pathways | Every requirement still weighs the same, and nothing in it knows what job you want. Stellic's four products — Progress, Care, Explore, Registration — contain no career, skills, or labor-market module. |
| Lightcast Skillabi / **Career Coach** | Skillabi maps curriculum to labor-market skills for curriculum committees; Career Coach is student-facing career exploration over a 32,000-skill library | Both stop at the **program or major**. Neither resolves to a specific section of a specific course you can register for next term. |
| Steppingblocks Digital Career Counselor | Student-facing career and outcomes exploration (Clemson, FIU) | Stops at the **occupation**. No degree requirements, no prereq graph. |
| Coursicle | Notifies when a seat opens; per-school professor reviews | We tell you whether the seat is worth taking at all |
| Handshake | Job listings | We work backwards from the listing into the course catalog |

**Our actual originality claim, which is narrower and stronger than "nobody does this":** we are the only one that goes job posting → O*NET work activity → **a specific CRN the student can register for next term**, constrained by their remaining requirements and their prereq depth.

Acknowledge the nearest prior art in one line — Frej et al., *"Course Recommender Systems Need to Consider the Job Market,"* SIGIR 2024 (LLM skill extraction + RL alignment to job-market demand). Naming it reads as domain fluency, not weakness.

---

## 5. DECISIONS ALREADY MADE — DO NOT RE-PROPOSE

These all sound like good ideas. They are closed. The reasoning:

| Rejected | Why it's closed |
|---|---|
| **A unified portal over DegreeWorks / Banner / Ellucian Experience** | This is adjacent to Stellic's own product — Stellic Progress already combines real-time degree audit, planning, and registration in one interface. Pitching it to Stellic scores zero on originality. |
| **Real SIS integration via Ellucian Ethos** | Requires an institution-issued API token from a Banner/Ethos administrator. A student cannot obtain one. Also unbuildable in 8 days. |
| **Actually registering the student into a live SIS** | The submission requires "a working link a judge can actually open." A judge in Philadelphia cannot log into GMU's Patriot Web. It is the single feature no judge can verify, and the most expensive to build. **We build a mock registration page instead.** |
| **Scraping RateMyProfessors** | No public API; their Terms of Use prohibit automated access, and a developer who built this exact feature (RMP ratings inside class registration) received a cease-and-desist. **We construct a search URL and render it as a plain hyperlink** — the student's browser makes the request, our server never does. |
| **Multi-semester / four-year planning** | Scope. Next term only. |
| **Free-form chat interface** | Structured buttons are faster to build, cannot break in a live demo, and look more finished on video. The "conversation" is: three options + a row of toggles + regenerate. |
| **A database** | No persistence needed. State lives in React; the catalog ships as static JSON. |
| **Migrating to the OpenAI Responses API** | Chat Completions is not deprecated. `zodResponseFormat` gives the same guardrail. Rewriting the one file all three routes depend on, for zero demo benefit, is net risk. |
| **Restructuring `Section` into `Meeting[]` + linked CRNs** | The lecture/lab pairing problem is solved at scrape time by dropping non-lecture rows (§9.1). Restructuring the field the teammate binds every schedule row to, on day 1, for a case the demo student never reaches. |
| **A `grades` map on StudentAudit** | Real work on Aug 17–19 for a condition no judge can observe. The §13 copy change ("prereq courses completed") plus the advisor footer covers it. |
| **Renaming the project** | §1 already says the name is provisional. A name is not a defect. Revisit only if the write-up won't write. |

---

## 6. ARCHITECTURE

### Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16 (App Router), React 19.2, TypeScript, Tailwind CSS v4** |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI base — record this in TOOLS.md) |
| AI | OpenAI API via `openai` npm package (v7) |
| Extraction model | `gpt-4o-2024-11-20` — **pinned**, not the floating `gpt-4o` alias — with Structured Outputs (`strict: true`) |
| Embeddings | `text-embedding-3-small` |
| PDF text | **`pdf-parse@^2`** (v2 is a rewrite — the v1 default-export API does not exist) |
| Scraping | `cheerio` + global `fetch` (Node ≥22 — **no `undici` dependency**) |
| Hosting | Vercel |
| Persistence | None. Static JSON in `/data`. |

> **Tailwind v4: there is no `tailwind.config.js`.** Theme tokens go in
> `app/globals.css` under `@theme`. If an assistant hands you a
> `tailwind.config.js`, it is wrong. This is the #1 source of "why isn't my
> custom color working."

> **Read `data/*.json` with a static `import`, never `fs.readFile`.** A runtime
> path built from `process.cwd()` is frequently not traced into the Vercel
> bundle, and `process.cwd()` inside a Lambda is `/var/task`.

### The key architectural decision

**Everything expensive happens offline at build time. The deployed app is thin.**

The course catalog does not change during a demo. So the scrape, the prereq-graph construction, and the skill embeddings all run once as local scripts, and their output is **committed as static JSON**. The deployed Next.js app reads those files.

Consequences:
- No Python anywhere. `text-embedding-3-small` replaces `sentence-transformers`, so the whole project is one language.
- No ML at runtime, no cold starts, no vector database.
- The app feels instant — which matters enormously when 40 seconds of a 2-minute video is someone clicking through it.
- Offline scripts can be slow and ugly. Runtime code cannot.

### Request flow at runtime

```
User pastes job postings
  → POST /api/extract-skills   (OpenAI, structured output)
  → returns O*NET skill IDs + which postings asked for each

User uploads audit PDF
  → POST /api/parse-audit      (pdf-parse v2 → OpenAI, structured output)
  → returns StudentAudit

Client computes locally (no API call):
  → bottlenecks   (prereqs.json + StudentAudit)
  → skill gaps    (catalog-skills.json + extracted skills + StudentAudit)

User clicks "build my semester"
  → POST /api/build-schedules  (deterministic combo generation in TS,
                                then OpenAI writes label/why/tradeoff prose)
  → returns 3 ScheduleOption
```

**The OpenAI key is server-side only.** It lives in `.env.local` as `OPENAI_API_KEY` and is read exclusively inside `app/api/**`. Never `NEXT_PUBLIC_`.

Ship `GET /api/health` returning `{ hasKey: !!process.env.OPENAI_API_KEY }` and hit it **on the live Vercel URL** on day 1. A missing env var in the Vercel dashboard is the single most likely day-1 deploy mistake, precisely because `.env.local` is gitignored.

---

## 7. REPO LAYOUT

```
reverse-audit/
├── CLAUDE.md                      # this file
├── AGENTS.md                      # generated by create-next-app; keep, and make
│                                  #   `@AGENTS.md` the first line of CLAUDE.md
├── TOOLS.md                       # running list of tools used (submission req)
├── README.md
├── .env.local                     # OPENAI_API_KEY=sk-...  (gitignored)
├── .env.example
│
├── scripts/                       # offline. Run with `npx tsx scripts/x.ts`
│   ├── scrape-catalog.ts          # CourseLeaf   → data/courses.json
│   ├── scrape-sections.ts         # Banner 8     → sections + observed termsOffered
│   ├── build-prereqs.ts           # prereq grammar → data/prereqs.json  (OpenAI)
│   ├── fetch-onet.ts              # O*NET DWA .txt → data/onet-dwa.json
│   ├── embed-skills.ts            # courses + DWAs → data/catalog-skills.json
│   └── verify-prereqs.ts          # sanity checks; EXITS NON-ZERO on a bad graph
│
├── data/                          # COMMITTED. The app reads these.
│   ├── courses.json
│   ├── prereqs.json
│   ├── onet-dwa.json
│   ├── DWA Reference.txt          # raw O*NET source, committed as insurance
│   ├── catalog-skills.json
│   └── degree-template.json       # BS-CS requirement template (manual-entry path)
│
├── samples/
│   ├── sample-audit.pdf           # so a judge can test without their own
│   ├── sample-job-swe.txt
│   ├── sample-job-data.txt
│   └── fallback-response.json     # cached output if OpenAI fails mid-demo
│
├── lib/
│   ├── types.ts                   # §8 — the frozen contracts
│   ├── openai.ts                  # client + a callStructured() helper
│   ├── bottlenecks.ts             # §11.1
│   ├── gaps.ts                    # §11.2
│   ├── schedules.ts               # §11.3
│   └── rmp.ts                     # builds a RateMyProfessors search URL
│
├── app/
│   ├── page.tsx                   # the flow — one page, four states
│   ├── layout.tsx                 # includes <Toaster /> from sonner
│   ├── register/page.tsx          # mock Banner-style registration page
│   └── api/
│       ├── health/route.ts        # { hasKey } — verify on the LIVE url, day 1
│       ├── extract-skills/route.ts
│       ├── parse-audit/route.ts
│       └── build-schedules/route.ts
│
└── components/
    ├── JobPostingInput.tsx
    ├── AuditUpload.tsx            # dropzone + manual-entry fallback
    ├── DiagnosisScreen.tsx        # bottlenecks + gap map
    ├── BottleneckCard.tsx
    ├── PrereqChain.tsx            # inline SVG chain (2h timebox — see §13)
    ├── GapMap.tsx
    ├── ScheduleOptions.tsx        # the three cards
    ├── ScheduleCard.tsx
    ├── PreferenceToggles.tsx
    └── Cart.tsx
```

---

## 8. DATA CONTRACTS (FROZEN — `lib/types.ts`)

Both people build against these. Write this file first, on day 1, before anything else.

```ts
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
  days: string;            // "MW", "TR", "F". "" for asynchronous.
  startTime: string;       // "13:30" 24h. "" for asynchronous.
  endTime: string;         // "14:45". "" for asynchronous.
  instructor: string;
  modality: "in-person" | "online" | "hybrid";
  term: Term;              // AUTHORITATIVE for registrability. You cannot register
                           // without a CRN, so §11.3 eligibility is decided by
                           // sections, NEVER by Course.termsOffered.
}

export interface Course {
  code: string;            // "CS 484" — canonical, always "DEPT NNN", single ASCII space
  title: string;
  credits: number;
  description: string;
  prereqText: string;      // raw text, exactly as the catalog wrote it
  termsOffered: Term[];    // OBSERVED from sampled Banner terms. Drives
                           // offeringPenalty ONLY, never registrability.
                           // Summer is never plannable. Never [] — default to
                           // ["fall","spring"] for any course not seen in a sample,
                           // because [] silently deletes the course from `eligible`.
  everyOtherYear: boolean; // ALWAYS false. Three terms of observation cannot
                           // establish an alternate-year pattern. Field kept so
                           // the frozen contract does not move; never set true.
  majorRestriction?: string | null;  // from catalog `p.maj`. 14 of 103 CS courses
                           // carry one. Optional + additive so mocks keep compiling.
  sections: Section[];
}

// ---------- Prereqs ----------

export interface PrereqRule {
  allOf: string[];         // every one required
  oneOf: string[][];       // each inner array = pick one from this group
  minGrade: string | null; // "C", "B-", null. Extracted but UNCONSUMABLE:
                           // StudentAudit.coursesTaken carries no grades. The UI
                           // must therefore say "prereq courses completed",
                           // never "all prereqs met". See §13.
  coreq: string[];
}

export type PrereqGraph = Record<string, PrereqRule>;

// ---------- Skills ----------

// NAMING RULE, no exceptions: skill fields are always skillId / skillName.
// Course fields are always code / title. This applies to API payloads too.
export interface Skill {
  skillId: string;         // O*NET DWA id, e.g. "4.A.2.b.2.I01.D01"
  skillName: string;
}

// course code → skills it teaches, with match confidence 0–1
export type CatalogSkills = Record<
  string,
  { skillId: string; score: number }[]
>;

// ---------- Student ----------

export interface Requirement {
  name: string;                        // "CS Core", "CS Elective"
  status: "complete" | "incomplete";
  missing: string[];                   // specific required course codes still needed
  slotsOpen: number;                   // for elective buckets; 0 for named requirements
  credits: number;
}

export interface StudentAudit {
  major: string;
  catalogYear: string | null;          // NULLABLE. Strict mode requires every
  creditsCompleted: number;            //   field in `required`, so a non-nullable
  creditsRequired: number;             //   string here forces the model to invent
  expectedGraduation: string | null;   //   one. "2027-12"; pattern ^\d{4}-\d{2}$
  coursesTaken: string[];              // ["CS 262", "CS 310"]
  requirements: Requirement[];
}
// When expectedGraduation is null, lib/bottlenecks.ts falls back to
//   termsRemaining = Math.max(1, Math.ceil((creditsRequired - creditsCompleted) / 15))

// ---------- Analysis output ----------

export interface Bottleneck {
  code: string;
  title: string;
  chainDepth: number;                  // longest dependent path behind it, IN EDGES
                                       //   (a leaf is 0)
  dependents: string[];                // transitive set of still-needed courses
                                       //   reachable from this one.
                                       //   dependents.length >= chainDepth, always.
  termsOffered: Term[];
  termsRemaining: number;              // integer count of fall+spring terms
  urgency: "critical" | "soon" | "flexible";
  reason: string;                      // human-readable, shown in UI
}

export interface SkillGap {
  skillId: string;
  skillName: string;
  demandCount: number;                 // how many of the pasted jobs wanted it
  coveredBy: string[];                 // already-taken or still-required courses covering it
  covered: boolean;                    // coveredBy.length > 0
  closableBy: string[];                // course codes that would close it (only when !covered)
}

export interface ScheduleOption {
  id: string;                          // = strategy
  strategy: "max-coverage" | "balanced" | "keeps-options-open";
  label: string;                       // "Close the data gap" — written by OpenAI
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
  conflicts: string[];                 // [] by construction — §11.3 step 5 only
                                       //   emits conflict-free combos. Field kept
                                       //   rather than moving a frozen contract.
  why: string;                         // one sentence, written by OpenAI
  tradeoff: string;                    // one sentence, written by OpenAI
}

export interface Preferences {
  lighterWorkload: boolean;
  noMornings: boolean;                 // no section starting before 10:00
  inPersonOnly: boolean;
}
```

---

## 9. OFFLINE SCRIPTS

### 9.1 `scrape-catalog.ts` + `scrape-sections.ts`

**There are two sources, not one. This is how every registrar's stack is laid out, and saying so is itself a good write-up line.** The catalog publishes descriptions, credits and prerequisites; the schedule of classes publishes CRNs, meeting times, instructors and modality. Both are public. Neither needs credentials.

#### Source A — catalog (CourseLeaf) ✅ VERIFIED public, server-rendered, HTTP 200

`https://catalog.gmu.edu/courses/<subject>/` for `cs`, `math`, `stat`, `it`, `engh`, `phys`. cheerio works, no headless browser.

Extract per course: code, title, credits, description, **raw prereq text**, and `p.maj` (major restriction).

- **robots.txt allows `/courses/` and DISALLOWS `/search/`.** Every prereq course reference is an `<a href="/search/?P=CS%20211">`. **Never follow those hrefs.** Read the anchor's `title` attribute instead — it already contains the canonical "DEPT NNN" code, which is also exactly what the prereq parser needs. One rule closes both the compliance and the correctness angle.
- **LOAD-BEARING: GMU puts a U+00A0 non-breaking space between subject and number.** ✅ VERIFIED — 613 of them on the CS page alone. `/[A-Z]{2,4} \d{3}/` matches ZERO courses and fails silently — the scraper "runs fine" and writes an empty file. Make `.replace(/ /g, ' ')` the **FIRST** step of the normalizer, before any regex.
- Read only blocks under `Required Prerequisites:` (✅ 66 on the CS page). **Never merge the `Recommended Prerequisite:` blocks** (✅ 39 of them) — different field, different meaning.
- Capture `p.maj` into `majorRestriction`. Apply it as a filter in §11.3 step 1 only. Ignore `p.deg` and `p.att`.

#### Source B — schedule of classes (Banner 8) ✅ VERIFIED public: no login, no cookies, no session

1. `GET https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_dyn_sched/`
2. `POST https://patriotweb.gmu.edu/pls/prod/bwckschd.p_get_crse_unsec/` with
   `term_in=<code>&sel_subj=dummy&sel_day=dummy&sel_schd=dummy&sel_insm=dummy&sel_camp=dummy&sel_levl=dummy&sel_sess=dummy&sel_instr=dummy&sel_ptrm=dummy&sel_attr=dummy&sel_subj=CS&sel_crse=&sel_title=&sel_schd=%25&sel_insm=%25&sel_from_cred=&sel_to_cred=&sel_camp=%25&sel_levl=%25&sel_ptrm=%25&sel_instr=%25&sel_attr=%25&begin_hh=0&begin_mi=0&begin_ap=a&end_hh=0&end_mi=0&end_ap=a`

- **The TRAILING SLASH is required.** Without it Banner 404s.
- The run of `dummy` sentinel values before the real ones is required or Banner rejects the POST.
- Banner 9 (`ssb.gmu.edu`) is firewalled (403). There is no public JSON API. Banner 8 HTML is the only path, and it is fully server-rendered.
- `patriotweb.gmu.edu` serves no robots.txt, so no path is disallowed there.

**Pull THREE terms in one run:** `202670` (Fall 2026), `202610` (Spring 2026), `202570` (Fall 2025). All three ✅ VERIFIED HTTP 200 with full CS data. Then:

- `Section[]` comes from `202670` only — that is the only registerable term.
- `Course.termsOffered` is **derived from what you observe**, never from prose: mark a course single-term only if the pattern REPEATS across the two same-season samples (present in Fall 2025 AND Fall 2026, absent from Spring 2026). Otherwise a one-off cancellation gets mislabelled as a policy bottleneck.
- **If a course appears in NO sampled term, default `termsOffered` to `["fall","spring"]`, never `[]`.**
- Set `everyOtherYear = false` for everything.

**Section parsing gotchas — all ✅ VERIFIED against live Fall 2026 CS data:**

- **Drop non-lecture rows.** The `Schedule Type` cell says Lecture / Laboratory / Recitation (✅ 138 Lecture, 23 Laboratory in CS alone); equivalently discard section numbers starting with `2`. This keeps §8 frozen and sidesteps lecture/lab pairing combinatorics entirely.
- **Modality.** Banner emits percentage-band strings. ⚠️ **The "nothing maps to hybrid" claim was CS-only and is false catalog-wide** — the other five subjects contain six further strings, and two of them state a SINGLE percentage rather than a range: `On-campus F2F 50% Async` (113 sections) and `On-campus F2F 50% Sync` (21). A range-only regex silently labels all 134 as `in-person`. Final Fall 2026 split across the six subjects: **691 in-person / 240 online / 54 hybrid.** Base map: `On-campus F2F 76-100%` → `in-person`; `Wiley Off F2F 0-1% Async` / `Off-campus F2F 0-1% Async` / `Off-campus F2F 0-1% Sync` → `online`; the 50% forms → `hybrid`. **Log any unmapped string loudly rather than defaulting.**
- **`Required Prerequisite:` also occurs in the SINGULAR** (CS 757). Match `/^Required Prerequisites?:/` — 67 blocks on the CS page, not 66.
- **Async sections carry `Time = "TBA"` and `Days = "&nbsp;"`.** Fix at parse time, not in the conflict checker: if Time doesn't match `/^\d{1,2}:\d{2} [ap]m/`, set `days=""` and `startTime=endTime=""`, and let the card render "Asynchronous — no set meeting time". Otherwise "TBA" hits the 12h→24h converter and renders `NaN:NaN` on a schedule card.

Normalize course codes to `"DEPT NNN"` with a single ASCII space — on write, never on read. Be polite: sequential requests, ~500ms delay, real user-agent, cache raw HTML to `.cache/`.

Output: `data/courses.json` conforming to `Course[]`.

### 9.2 `build-prereqs.ts`

Converts `prereqText` into `PrereqRule`. **GMU does not write prose** — it emits a Banner-generated boolean expression with grade codes as superscripts. The two REAL strings, ✅ verified live:

> **CS 330:** `Required Prerequisites: (CS 211^C or 211^XS) and (MATH 125^C or 125^XS).`
> **CS 484:** `Required Prerequisites: ((CS 310^C or 310^XS) and ((STAT 344^C, 344^XS, 334^C, 334^XS or 346^C) or (MATH 351^C and 352^C))).`

⚠️ **Both strings above were transcribed with the wrong parenthesization in the
original spec** (an outer pair added to CS 330, omitted from CS 484). The
versions here match the live catalog. **Build few-shots from `data/courses.json`,
never from a transcription in this file.**

**`^*` is the only coreq signal.** Strip the `^C Requires minimum grade of C.`
legend lines but KEEP `^* May be taken concurrently.` — a `^*` on a token is what
makes `PrereqRule.coreq` populatable. Example, CS 262:
`Required Prerequisites: (CS 110^*^C, 110^XS or 101^*) and (CS 211^C, 211^XS, 222^C or 222^XS). ^* May be taken concurrently.`

Build the prompt and few-shots against **that format**, not against prose. Soften the claim in the write-up too: catalog prereqs are a grade-coded grammar that differs at every institution, so we parse them with a model and validate every emitted course code against `courses.json`.

Parser notes, all verified against the live CS catalog:

- **`XS` is NOT a grade and NOT a course** — it is a transfer/test-credit equivalency. `"CS 211^C or 211^XS"` is ONE course with two credit paths. Dedupe on normalized code within each parenthesised group or you double every `oneOf` group with phantom nodes.
- `PrereqRule.minGrade` at rule level is **lossless at GMU**: 27 blocks use only B-, 40 use only C, ZERO mix the two. §8 does not change.
- Two blocks contain `"minimum score of 80 in 'Math Placement Aleks'"` — ✅ verified, it is in the very first prereq block on the CS page. A naive parser will emit it as a course. **Discard non-course tokens.**
- Nine tokens in all of CS are unanchored (4× "614", 4× "261", 1× "101"). Everything else carries an `<a title="MATH 113">`, which hands you the canonical code for free.

Use `gpt-4o-2024-11-20` with Structured Outputs and `strict: true`. Batch ~20 courses per call. Include the course code in the prompt so the model can resolve ambiguous references.

**Strict mode cannot express `Record<string, T>`** — it requires `additionalProperties: false` on every object with every property listed in `required`, and `patternProperties` is unsupported. So the model returns `{ rules: [{ code, allOf, oneOf, minGrade, coreq }] }` and the script folds it: `Object.fromEntries(rules.map(({code, ...r}) => [code, r]))`. §8 is untouched. Declare the wrapper locally inside the script — do not add wire types to `lib/types.ts`.

**Do NOT infer `everyOtherYear`.** There is no terms prose in the GMU catalog to infer it from (verified: zero hits for "offered fall", "alternate year", "even-numbered", "Terms Offered" across all of CS). `termsOffered` comes from observed Banner sections per §9.1.

### 9.3 `fetch-onet.ts`

Fetch the **tab-delimited** O*NET DWA Reference (link in §17 — note: §17, not §16), flatten to `Skill[]`, write `data/onet-dwa.json`. 2,070 entries. One-time, **zero new dependencies**:

```
fetch → split('\n') → drop header → split('\t') → { skillId: cols[2], skillName: cols[3] }
```

Column 2 is DWA ID (which is what §8's example `"4.A.2.b.2.I01.D01"` is); column 3 is DWA Title.

**Commit the raw `.txt` into `data/`** so a future O*NET version bump cannot break the build — cheapest insurance in the project.

Stay on **20.1**. Syllabus2O*NET — the method we cite — produces a vector of size 2,070, which IS the 20.1 vocabulary. Staying on 20.1 keeps parity with the paper, and that is the clean answer if a judge asks about dataset vintage.

`TOOLS.md` and `README` must carry: *"Includes information from the O*NET 20.1 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. O*NET is a trademark of USDOL/ETA."* Attribution is a license condition. Keep DWA names verbatim in the gap-map chips (truncate with CSS ellipsis, never by editing the string) and the "indicate changes" clause never fires. **Do NOT put this in the §13 footer** — that footer is doing advisor-disclaimer work.

### 9.4 `embed-skills.ts`

1. Embed every DWA name with `text-embedding-3-small`.
2. **Sentence-split each course description** on `/(?<=[.!?])\s+/`; embed the title and each sentence separately; **score = max** across them. This matches Syllabus2O*NET's actual method (segmentation → per-sentence cosine → max per skill) and removes most of the length bias, which is real: CS 330's description is 25 words and several CS blocks run 80–100.
3. Cosine similarity, course × skill.
4. **Mean-center per DWA:** `s' = s − (mean of that DWA's score across the scoped catalog)`. **This is the highest-value line in this section.** It kills hubness — generic DWAs like *"Prepare reports."* sit near the centroid of all technical English and will otherwise land in the top-15 for nearly every course, making every course show the same chips and collapsing §2's entire "choosing" thesis on camera.
5. **Replace the absolute 0.35 threshold with rank + relative margin:** top-15 per course, keep `s' >= 0.6 × (max s' for that course)`. Scale-free; retires the threshold-tuning step entirely.
6. Write `data/catalog-skills.json`.

Cost is a few cents at these volumes. Batch embedding inputs (up to ~100 per request) and cache by content hash so re-runs are free.

**Sanity gate — the original one was not strong enough.** Printing the top skills for CS 484 (Data Mining) and ENGH 302 (Composition) passes even under total hubness collapse. Keep the print, and **add the check that actually catches it: assert the two top-15 lists overlap by no more than ~3 items.** Fix it before moving on — everything downstream inherits this.

### 9.5 `verify-prereqs.ts`

Prints: courses with prereqs that don't exist in the catalog, cycles in the graph, and the ten deepest chains. **Hand-check those ten against the real catalog before trusting the bottleneck feature.** If the graph is wrong, the demo makes false claims to a room full of registrars.

**Exit non-zero** on a detected cycle or dangling prereq, so a bad graph is not committable.

---

## 10. DATA: REAL VS MOCKED

The line: **everything public is real; everything that is a student's private record is mocked.**

**Real:**
- **GMU course catalog** — codes, titles, credits, descriptions, prerequisites. Public CourseLeaf webpages.
- **GMU public schedule of classes** — CRNs, meeting days and times, instructors, modality, observed terms offered. Public Banner 8 self-service, **no login**.
- Job postings — the student pastes the text
- O*NET Detailed Work Activities — free US Dept. of Labor dataset

**Two public sources, no credentials, no API key, no procurement.**

**Mocked:**
- The student's degree audit — a realistic sample PDF we author
- The registration system — our own Banner-styled page at `/register`
- Seat availability / enrollment counts

**Why the catalog must be real:** if we invent the courses, we also invent their skills and their prereqs — so the gap map and the bottleneck graph would be matching our fiction against our fiction. It would prove nothing, and a judge who knows the domain can tell instantly.

**There are no school credentials and no SIS integration anywhere in this project.**

---

## 11. ALGORITHMS

### 11.1 Bottleneck detection (`lib/bottlenecks.ts`)

```
Input:  StudentAudit, PrereqGraph, Course[]
Output: Bottleneck[]

1. remainingRequired = union of requirement.missing across incomplete requirements
2. Build reverse edges: for each course, which courses list it as a prereq
3. For each c in remainingRequired:
     chainDepth = longest path from c through the reverse graph,
                  counting only courses still needed
     termsRemaining = count of fall and spring terms strictly between now
                      and expectedGraduation; Math.max(1, ...)
     offeringPenalty:
       const offered = termsOffered.filter(t => t !== "summer");
       offeringPenalty = offered.length >= 2 ? 0 : 1;
     urgency:
       critical  if chainDepth + offeringPenalty >= termsRemaining
       soon      if chainDepth + offeringPenalty >= termsRemaining - 1
       flexible  otherwise
4. reason = generated string, e.g.
   "3 courses depend on it · 3 terms left"
5. Sort by urgency, then chainDepth desc
```

**Define the graph once.** Both `chainDepth` and `dependents` are computed over **the reverse graph restricted to `remainingRequired`**. `chainDepth` is measured in edges (a leaf is 0). `dependents` is the transitive set of still-needed courses reachable from `c`, so `dependents.length >= chainDepth` always. Getting this wrong produces "8 courses depend on it" under a "SAFE TO DELAY" heading.

**`termsRemaining` was `months / 4`.** That counted summer as plannable, overstated runway by ~33%, and rendered non-integers straight into the `reason` string ("2.25 terms left" on a bottleneck card). Use the integer fall/spring count above.

**Summer is never plannable.** It is excluded from `offeringPenalty` and from `termsRemaining`.

Memoize the longest-path computation — but **add a `visiting` Set guard that returns 0 on a back edge.** A memo written only after the recursive call returns never terminates on a cycle, and §6 puts this computation client-side, so the failure mode is a `RangeError` inside a React render — a white screen. Three lines. Never assume the committed JSON is clean at runtime, even though §9.5 gates it.

### 11.2 Skill gap computation (`lib/gaps.ts`)

```
Input:  extracted job skills, StudentAudit, CatalogSkills
Output: SkillGap[]

1. demanded = skills extracted from job postings, with a count of how
   many postings requested each
2. alreadyCovered = union of skills taught by
     (a) courses the student has already taken
     (b) required courses they still must take (they're locked in anyway)
3. For each demanded skill s, emit a SkillGap:
     coveredBy = courses in (a)+(b) that teach s
     covered   = coveredBy.length > 0
   The array is EVERY demanded skill, covered and not — not a set difference.
4. closableBy (computed only where !covered) = courses in the catalog that
   teach it AND whose prereqs the student has satisfied
5. Sort covered asc, then demandCount desc
```

> **Why step 3 changed.** As originally written, step 3 returned only the set
> difference `demanded − alreadyCovered` — which made `covered` always `false`
> and `coveredBy` always `[]`, so §13's two-color chip map had no data for the
> first color. The **type was right and the algorithm was wrong.**

**Design note for the UI:** counting still-required courses as "covered" is deliberate and worth surfacing. It tells the student *"you're already getting this, don't waste an elective on it"* — which is a more useful message than a longer gap list would be.

### 11.3 Schedule generation (`lib/schedules.ts`)

Deterministic in TypeScript. The LLM does not pick courses.

```
1. eligible = courses where
     - prereqs satisfied by coursesTaken
     - has at least one section with term === NEXT_TERM  (sections are
       authoritative for registrability, NOT Course.termsOffered)
     - not already taken
     - has at least one section matching Preferences
     - passes majorRestriction, if present
     - EXCLUDE courses whose coreq list contains anything not already in
       coursesTaken and not itself eligible next term
2. mustTake = bottlenecks with urgency = critical AND present in `eligible`,
   sorted chainDepth desc, truncated to the largest prefix fitting
   targetCredits.
   Criticals excluded here are listed on the diagnosis screen as
   "not offered next term — see your advisor", NEVER on a schedule card.
3. slots = Math.max(1, sum of slotsOpen across incomplete elective requirements)
4. targetCredits = 15 (12 if preferences.lighterWorkload)
5. Generate candidate combos: mustTake + up to `slots` electives from
   eligible, total credits <= targetCredits, no time conflicts.
   When a combo includes a course with a coreq, add the coreq AND its section
   before checking credits and conflicts.
   Cap the search — take the top ~40 electives by gapValue, then enumerate.
   Do not brute-force the whole catalog.
6. Score each combo three different ways:
     gapValue(course) = Σ over uncovered gaps the course closes of
                        (gap.demandCount × catalogSkills[course][skillId].score)
     heaviness(course) = course.credits + (course number >= 400 ? 1 : 0)

     max-coverage       → maximize gapsClosed
     balanced           → gapValue(combo) − 0.5 × Σheaviness
                          − 2 × max(0, totalCredits − 13)
     keeps-options-open → maximize |union of `postings` across the skills the
                          combo closes|, tie-broken by gapsClosed desc then
                          totalCredits asc
7. Walk each strategy's own ranked list in fixed order
   [max-coverage, balanced, keeps-options-open], taking the highest-scoring
   combo not already used. If fewer than three distinct combos exist, §13
   renders FEWER cards rather than duplicates.
8. FLOOR: if enumeration yields nothing, fall back to mustTake plus the single
   highest-gapValue eligible elective that fits. The screen never goes blank.
9. Send the surviving combos to /api/build-schedules for prose.
```

**Why `gapValue` and `heaviness` are defined here:** without them, `balanced` has no formula and silently collapses into `max-coverage`, producing two visually identical cards on the screen that owns the largest block of the video.

**Fallback for `keeps-options-open`:** if the `postings` field (§12.2) feels risky on the day, the zero-API-change alternative is to maximize distinct downstream courses unlocked, computed client-side from `prereqs.json`.

**Time conflict check:** two sections conflict if they share any day character and their `[startTime, endTime)` intervals overlap. Compare as minutes-since-midnight integers, not strings. Asynchronous sections (`days === ""`) never conflict.

### 11.4 Professor links (`lib/rmp.ts`)

```ts
export function rmpUrl(instructor: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(instructor)}`;
}
```

That's the whole feature. **We never fetch this URL.** We render it as a link the student clicks. No scraping, no ToS problem, and better product design — we aren't asserting a rating, we're saying "go look."

---

## 12. API ROUTES

All three use OpenAI Structured Outputs. Pattern for `lib/openai.ts`:

```ts
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

// LAZY. `new OpenAI()` throws synchronously when the key is missing; at module
// scope that fires on first import, BEFORE your handler body, so it 500s
// outside the try/catch and the degraded fixture never renders.
let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function callStructured<T>(
  system: string,
  user: string,
  schema: ZodType<T>,                        // zod, not `object` — see note below
  schemaName: string,
): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: "gpt-4o-2024-11-20",              // pinned; `gpt-4o` is a floating alias
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: zodResponseFormat(schema, schemaName),
  });

  const c = res.choices[0];
  if (!c) throw new Error("no choice returned");
  if (c.message.refusal) throw new Error("refusal: " + c.message.refusal);
  if (c.finish_reason === "length") throw new Error("truncated");
  const content = c.message.content;
  if (typeof content !== "string" || !content) throw new Error("empty content");
  return JSON.parse(content) as T;
}
```

> The `!` non-null assertion is deleted **deliberately** — it hid the refusal
> case from TypeScript. `JSON.parse(null)` does not throw; it returns `null`.
> The original code would therefore return `null as T`, sail past the route's
> try/catch, never set `degraded`, and crash later in the UI as a blank screen.

> **Use zod + `zodResponseFormat` rather than hand-written JSON Schema.** §14
> already installs zod and §12 never used it. Strict mode requires
> `additionalProperties: false` on EVERY nested object and EVERY property in
> `required` — easy to forget on `Section` inside `ScheduleOption.courses[]`,
> and each miss is a runtime 400 mid-build. Use `.nullable()`, never
> `.optional()`. Do not add extra `pattern` / `min` / `max` constraints beyond
> `expectedGraduation` — each one is another way to get a 400 for no demo benefit.

Every route: wrap in try/catch, log the error server-side, and return the matching fixture from `samples/fallback-response.json` with a `degraded: true` flag rather than a 500. **The demo must never show an error state.**

**Fixture file shape** — one file serving three routes:

```json
{
  "parse-audit":     { "audit": {}, "degraded": true },
  "extract-skills":  { "skills": [], "degraded": true },
  "build-schedules": { "options": [], "degraded": true }
}
```

**No "showing cached sample results" badge.** §16 records with sample data and no live calls, so the badge can only ever fire in front of a judge clicking the live link, where it reads as a broken app rather than as honesty.

> **ONE carve-out, added Aug 15: an audit the student uploaded themselves.** The
> rule above is right about the other two fixtures and right about the judge's
> path, and it stays. But the parse-audit fixture is not a list of skills — it is
> **another person's academic record**, and the screens downstream present it as
> the student's own: their major, their credits, their courses taken, their
> graduation date. A real student who uploads a real transcript against a dead
> key is not being shown a degraded feature, they are being shown someone else's
> degree progress with their name on it. That is §0 rule 7 at its worst, and the
> no-badge rule was never weighing this case, because §16 films the sample path.
>
> So the signal is gated on the ENTRY POINT, not on the route:
>
> | Entry point | On degrade shows | Signal |
> |---|---|---|
> | "use the sample audit" — the judge's path | the sample student, i.e. what the button promised | **no** |
> | the dropzone — a real transcript | a stranger's record labelled as theirs | **yes** |
> | manual entry — never hits the route | their own data | n/a |
>
> The judge cannot reach it, which is what keeps §16's concern satisfied
> structurally rather than by hoping. Copy is a quiet inline line on the
> diagnosis screen, in the "soon" ochre rather than critical red, and it names no
> cause — the route degrades on six different failures and the client cannot tell
> them apart. Implemented at `app/page.tsx` (`parseAuditPdf` / `handleFile`) and
> `DiagnosisScreen`'s `auditIsFixture` prop.

### 12.1 `POST /api/parse-audit`

Body: `multipart/form-data` with the PDF.
Steps: pdf-parse **v2** → raw text → `callStructured` → `StudentAudit`.

```ts
import { PDFParse } from "pdf-parse";   // NAMED export. There is no default in v2.
const parser = new PDFParse({ data: buf });
try   { const { text } = await parser.getText(); /* ... */ }
finally { await parser.destroy(); }
```

Any assistant or tutorial that hands you `const pdf = require('pdf-parse'); await pdf(buf)` is writing v1 and will throw `"pdf is not a function"` at runtime. The famous v1 `ENOENT ./test/data/05-versions-space.pdf` Vercel failure is gone in v2 — **and comes back if anyone pins `^1`. Do not pin `^1`.**

**Guard the upload client-side:** Vercel caps request bodies at 4.5 MB at the infrastructure level. A larger file returns a raw 413 that never reaches the handler, so the §12 try/catch and the `degraded` fixture structurally cannot cover it. Check size and MIME in `AuditUpload.tsx` before the fetch.

System prompt should say: extract only what is present; do not infer or invent courses; if a field is genuinely absent, use the schema's null/empty value. DegreeWorks layouts differ by institution, so instruct the model to work from semantic content rather than expected positions — **this generalization is a real scale argument to make in the write-up.**

Return `{ audit, degraded }`. **On failure, serve the fixture** — that is the demo-safe answer. Manual entry (§13 State 2) stays as an off-camera path for a real student without a PDF.

### 12.2 `POST /api/extract-skills`

Body: `{ postings: string[] }`.
Steps: for each posting, extract required skills and normalize each to the closest O*NET DWA.

Return `{ skills: { skillId, skillName, demandCount, postings: number[] }[] }`, where `postings` holds the **indices of the pasted postings** that asked for that skill. The model already processes each posting separately, so this is a schema line, not new work. **Without it, §11.3's `keeps-options-open` strategy has no input and silently produces the same combo as `max-coverage`.** `demandCount` is a cardinality and cannot be inverted into a membership set.

**Prompt scoping:** pass ONLY the DWAs that appear in `data/catalog-skills.json`, not all 2,070. A demanded skill that no scoped course teaches can never appear in `SkillGap.closableBy`, so it is pure noise. This drops the prompt from ~45k tokens to ~5–8k and materially improves selection accuracy. Instruct the model to return only ids from that list.

### 12.3 `POST /api/build-schedules`

Body: `{ combos, gaps, bottlenecks, audit }` — combos already chosen by `lib/schedules.ts`.
The model's **only** job is writing `label`, `why` and `tradeoff` for each combo. One sentence each. It must not add, remove, or reorder courses.

> `label` ("Close the data gap") appears in §13's mock with no producer anywhere
> in the original spec. This is where it comes from.

`Combo` is a local type inside `lib/schedules.ts` and this route. **Do not add wire types to `lib/types.ts`** — everything the UI consumes is already frozen in §8.

System prompt guidance: be specific and concrete. *"All three target roles asked for SQL and distributed systems; nothing left in your required courses touches either"* is right. *"This is a well-rounded schedule"* is useless.

---

## 13. UI SPEC

One page, four states, driven by React state. No routing except `/register`.

**State 1 — Job postings.** Three textareas, "paste a job posting you'd want in two years." Sample-fill button that loads `samples/sample-job-*.txt` — the judge will use this, so make it prominent.

**State 2 — Audit upload.** Dropzone. "Download a sample audit" link next to it. Below, collapsed: "or enter manually" → major, credits completed, expected graduation, courses taken (tag input), electives remaining. The manual path must be completable in ~20 seconds.

> **Manual entry fills `requirements[]`, `catalogYear` and `creditsRequired`
> from `data/degree-template.json`** — one committed BS-CS template authored
> from the same public requirement list used to write `sample-audit.pdf`. Core
> `missing[]` = `template.core` minus `coursesTaken`; the elective bucket takes
> `slotsOpen` from the electives-remaining field. Without this, manual entry
> collects 4 of the 7 required `StudentAudit` fields and — fatally — no
> `requirements[].missing`, which is the sole input to §11.1 step 1.
> You are authoring that content by hand anyway (§14 step 2) — this is the same
> work written to a file as well as a PDF.

**State 3 — Diagnosis.** Two columns.

```
⚠ TAKE THIS TERM OR YOU GRADUATE LATE
CS 262 — 2 courses depend on it · 2 terms left

✓ SAFE TO DELAY
CS 405 — nothing you still need depends on it
```

> **ILLUSTRATIVE ONLY.** Every string on this screen is generated from
> `verify-prereqs.ts` output at runtime. Do not hardcode any of it, and pick the
> real hero example on the day the diagnosis screen is built, from data you
> already have. Chain depth is provable from `prereqs.json`; offering pattern is
> only provable from observed Banner sections.
> **CS 306 DOES NOT EXIST** in the 2026–2027 catalog — it was renumbered to
> CS 405 "Ethics and Law in Computing" (whose entry says "Equivalent to CS 306").
> The hero bottleneck computed from the real graph is **CS 262**, chainDepth 2,
> holding up CS 367 and CS 471.
> **CS 330 is NOT fall-only** — ✅ verified: Fall 2026 CRNs 77905/77906/80167,
> Spring 2026 CRNs 17906–17909, Fall 2025 CRNs 77959/80257. GMU CS is mostly
> every-term, so a genuinely single-term REQUIRED course may not exist. If it
> doesn't, drop the offering framing entirely and lean the narrative on
> `chainDepth` alone. CS 211 → CS 310/330 → CS 4xx chains are real and
> verifiable, and that still sells §2.

Right column, the gap map: skills as chips, two colors — *already covered by your required courses* vs *missing*. Sorted by how many of the pasted jobs asked for each. This screen and the next are the two that sell the product; give them the design time.

**Draw the prereq chain (`PrereqChain.tsx`, 2h timebox, teammate track).** `Bottleneck.dependents` and `chainDepth` already exist in the frozen contract and §11.1 already computes the longest path — shipping only the string "3 courses behind it" throws away the render. A registrar's mental model of a curriculum literally *is* that graph. Static inline SVG, three or four nodes beside the critical bottleneck card, completed courses greyed, blocked path highlighted. No graph library, no layout engine — hardcode horizontal positions from `chainDepth`. If it overruns two hours, ship the text and move on; this enhances a working screen rather than gating one.

**State 4 — Three schedules.**

```
OPTION A — "Close the data gap"
─────────────────────────────────────
CS 330  Formal Methods and Models        ⚠ bottleneck
CS 484  Data Mining                      [prof link]
CS 475  Concurrent and Distributed Sys   [prof link]
(meeting times come from Banner at runtime — do not hardcode them here)

Clears 1 bottleneck · Closes 7 of 11 gaps · 3 of 5 slots
✓ Prereq courses completed   ✓ No time conflicts

Why: All three target roles asked for SQL and distributed
systems. Nothing left in your required courses touches
either. CS 330 sits at the head of a three-course chain.

Tradeoff: Heaviest workload of the three. CS 475 is the
only 400-level course in this option.
```

> "✓ **Prereq courses completed**", not "All prereqs met". `minGrade` is
> extracted but unconsumable — `coursesTaken` carries no grades — so the
> stronger claim is false for a student with a D. See §8.
>
> **CS 468 is "Secure Programming and Systems," not Cloud Computing.** The
> original mock invented that title. Rule 7 in §0 exists because of this.

Below the three cards: a single row of toggles — *lighter workload · no morning classes · in-person only* — and a regenerate button. That is the entire "talk to it" experience, and it's enough.

Selecting a card → cart: course list with CRNs, a copy button, and a "register" button that goes to `/register`. Add one static line to the cart: *"Some courses also require a linked lab or recitation section — check Patriot Web before submitting."*

**`/register`** — deliberately plain, Banner-styled. Prefilled CRNs, submit, green confirmation. A visible line: *"Simulated registration system. Production would connect to the institution's SIS."*

**Persistent footer disclaimer, all screens:** *"Suggestions based on public job postings and course descriptions. Confirm with your advisor before registering."* This costs nothing and registrars in the judging room will trust the product more for it.

---

## 14. DAY 1 — SETUP

```bash
npx create-next-app@latest reverse-audit \
  --typescript --tailwind --app --eslint --no-src-dir
cd reverse-audit

npm i openai zod cheerio pdf-parse@^2
npm i -D tsx

npx shadcn@latest init -y -d
npx shadcn@latest add -y button card badge textarea input tabs switch sonner

mkdir -p scripts data samples lib components .cache
printf 'OPENAI_API_KEY=\n' > .env.example
printf '.env.local\n.cache/\n' >> .gitignore
```

Notes that travel with this block:

- **`--src-dir=false` is not a valid form.** It is silently ignored — the original spec got the right outcome by luck, not by instruction. Use `--no-src-dir`.
- **`toast` is deprecated on shadcn** and the July 2026 default base is Base UI, not Radix — `add toast` installs a component whose API matches no tutorial. Use `sonner`: `import { toast } from 'sonner'` plus one `<Toaster />` in `layout.tsx`. **The whole `add` line fails atomically, so a bad `toast` takes the other seven with it.** Record "Base UI" in `TOOLS.md` the same minute.
- **Do not pass `--yes` to create-next-app.** It replays whatever preferences were previously saved on that machine, which is strictly *less* deterministic than the explicit flags above.
- `create-next-app` writes both `AGENTS.md` and `CLAUDE.md`. The generated `CLAUDE.md` is one line (`@AGENTS.md`). Overwrite it with ours, keep `@AGENTS.md` as our first line, and commit `AGENTS.md` including the managed block so `next dev` doesn't leave a dirty tree.
- **`undici` is deleted deliberately:** openai v7 requires Node ≥22, so global `fetch` is guaranteed. It bought nothing and cost a line in `TOOLS.md` we'd have to justify.
- **`@types/pdf-parse` is deleted deliberately:** pdf-parse v2 ships its own types.
- **Do not pin Node in `engines` or add `.nvmrc`** — one more thing that can fail a Vercel build for a problem that does not exist here.

Then, in this order:

0. **Both teammates register at https://www.stellic.com/pathfinders.** Five minutes, free, and the submit form is gated behind it.
1. **`lib/types.ts`** — paste §8 verbatim. Commit. Tell your teammate it's in. Everything else unblocks from here.
2. **`samples/`** — write the two job postings, author `sample-audit.pdf` (a realistic DegreeWorks-style PDF; a styled HTML page printed to PDF is fine), and write `data/degree-template.json` in the same pass.
3. **`scripts/scrape-catalog.ts`** — the URLs are confirmed in §9.1. Normalize the nbsp first.
4. **`scripts/fetch-onet.ts`** — six lines, mechanical; do it while the scraper runs.
5. **Push to GitHub, connect Vercel, deploy the empty app. Get the URL working on day 1** so deployment is never a day-7 surprise. Ship `/api/health` and a trivial `/api/parse-audit` that only imports pdf-parse v2 and returns `{ok:true}` — **verify both on the live Vercel URL, not locally.**
6. **Create `TOOLS.md`** and append to it from here on.

Meanwhile the teammate scaffolds all four screens against hardcoded objects matching `lib/types.ts`. Real data replaces the mocks on Aug 17 with no rewrite.

---

## 15. SCHEDULE AND CUT ORDER

Two tracks: **B** = Bao (data pipeline + API routes), **T** = teammate (UI + demo assets). Bao is at half capacity Aug 13–14.

| Date | B (Bao) | T (teammate) | GATE at end of day |
|---|---|---|---|
| **Thu Aug 13** *(B ½)* | Register (5 min, first). Land the §18 edits. Commit `lib/types.ts` and announce it. create-next-app, shadcn, push, Vercel deploy. `/api/health` + trivial `/api/parse-audit`. Create `TOOLS.md`. | Scaffold all four screens against hardcoded objects matching `lib/types.ts`. Tailwind v4 tokens in `app/globals.css` (no config file). | Live Vercel URL loads · `/api/health` returns `hasKey:true` · pdf-parse imports in production · `types.ts` committed |
| **Fri Aug 14** *(B ½)* | `scrape-catalog.ts` → `courses.json` (no sections yet). `fetch-onet.ts`. | Finish scaffolds. Author `sample-audit.pdf` from the real public BS-CS requirement list; write `data/degree-template.json` in the same pass. | `courses.json` has >500 courses, non-empty `prereqText`, every code matches `/^[A-Z]{2,4} \d{3}$/` (nbsp normalized) |
| **Sat Aug 15** | `scrape-sections.ts` (202670/202610/202570) → sections + observed `termsOffered`, merged into `courses.json`. `build-prereqs.ts` + `verify-prereqs.ts`. Hand-check 10 chains. | Diagnosis screen visual design against mocks. `PrereqChain.tsx` (2h timebox). | `verify-prereqs` exits 0 · 10 chains hand-checked · **the real hero bottleneck chosen from data** |
| **Sun Aug 16** | `embed-skills.ts` with sentence-split + mean-centering + relative margin. | Gap map + bottleneck cards wired to fixtures. | `catalog-skills.json` passes the **overlap assertion** (CS 484 ∩ ENGH 302 ≤ 3) · **write-up draft exists** |
| **Mon Aug 17** | `parse-audit` + `extract-skills` routes. Real data reaches the UI. **Then 30 min: run `sample-audit.pdf` through the real pipeline and tune the PDF — not the algorithm — until it yields exactly one critical bottleneck and 2–3 open elective slots.** | Integrate real data. No rewrite. | Diagnosis screen renders from real `courses.json` + a real audit parse |
| **Tue Aug 18** | `lib/schedules.ts` + `build-schedules` route + every defensive clause in §11.3. | Options screen + toggles + cart. | **Three visibly distinct cards** from the real sample audit |
| **Wed Aug 19** | Mock `/register`. `fallback-response.json` keyed by route. Break-proofing: bad PDF, oversized PDF, missing key, refusal, empty combo set. | Polish both hero screens. | **HARD FEATURE FREEZE 23:59.** Evening: record one throwaway take — it surfaces bugs while they are still fixable. After this, bug fixes to existing features only. |
| **Thu Aug 20** | Record the real video (~1:50 of content). Publish publicly; verify in incognito. Finish the write-up. `TOOLS.md` final pass. **Open the submit form; if it permits post-filing edits, file a complete draft tonight.** | Verify the Vercel URL in incognito, on a phone, on a different network. | Video published and publicly playable · write-up ≤500 words · `TOOLS.md` complete |
| **Fri Aug 21** | Morning: 20-min pass over every on-screen string for checkable GMU facts. Re-record only if a take surfaced something. **Decide 04 vs 01 in five minutes. Submit by 17:00 ET.** | Same pass. | Submitted. Do not use the 11:59 p.m. margin. |

**Standing rule that makes the cut list function as buffer instead of a wish list:** if a day's gate is unmet at end of day, the next cut fires the following morning rather than being deferred.

**Never cut:** the prereq graph · the mock registration page · the persistent advisor disclaimer.

> The mock registration page moved onto the never-cut list. §5 closes the
> live-SIS decision with *"We build a mock registration page instead,"* and §16
> says judges from partner colleges recognize that framing as the correct
> answer. Cutting it contradicts two other sections — and it's the ending of the
> video. Cut it and the video ends on a list of courses, which is where every
> other submission ends.

**Cut order if behind:** third schedule strategy → preference toggles (degrade three to one; keep *"no morning classes"* because it makes regenerate visibly change something on camera) → the gap map's "covered" column.

**Days 6 and 7 are not optional.** Design/experience and how-well-it's-built are two of the five criteria — 40% of the score lives in the last two days.

---

## 16. WRITE-UP AND VIDEO NOTES

Lines worth using:

- *"A degree plan tells you what's left. It doesn't tell you which boxes are load-bearing."*
- *"Every elective slot is a decision made with no information."*
- On the mocking, be direct: *"Registration executes against a simulated SIS. Production would use the institution's student information system, which requires an institution-issued API key."* Judges from partner colleges will recognize that as the correct answer, not a dodge.
- **Scale:** *"**Zero SIS integration required.** Course descriptions and prerequisites come from the public catalog; sections come from the public schedule of classes. Both are public at essentially every US institution. No institutional credentials, no API key, no procurement."* A precise claim beats a round number, and *"where do you get my CRNs"* is the obvious floor question.
- **The institutional argument** — every other line here is pitched at a student, but the judges run registrars' offices. One sentence, zero build cost: *"The aggregate of many students' bottleneck computations is course-demand data — the same signal institutions currently buy to fix the 15% problem."* It falls out of the architecture for free and reframes the Ad Astra figure from an accusation aimed at the people in the room into something you're helping them see. **Do not build any aggregation feature.**
- Stellic's founder is a first-generation immigrant and first-generation college student. Nearly 3,000 of Mason's incoming students in fall 2024 were transfer students, and 24% of Mason undergraduates are first-generation. *(Lead with the transfer figure — it is the genuinely striking one. "High proportion" was the one phrase a provost in the room could correct out loud.)*
- Cite the statistics by name: *"Talent Disrupted, Strada Institute for the Future of Work and the Burning Glass Institute, February 2024"* and *"Ad Astra 2024 Benchmark Report (1.3M students)."* Eight words, and some judges are Ad Astra customers.

**Video budget (~1:50 against a hard 2:00 cap — the original cut summed to exactly 120s with zero margin):**

`12s problem → 25s bottleneck screen → 25s gap map → 25s options screen → 20s build-and-provenance → 10s cart`

The problem beat is too long for an audience that tracks underemployment professionally; the three option cards are self-similar, and one visible toggle flip proves liveness better than 40 seconds of scrolling. Spend the recovered seconds on **provenance and build quality** — `data/courses.json` on screen, one line that the catalog and the schedule of classes are both real and public, one line that the model never picks a course. That is two of five criteria currently getting zero screen time.

Record with sample data pre-loaded. Do not do live API calls on camera.

**Before anything ships: re-open every cited statistic at its source and confirm it verbatim.**

---

## 17. REFERENCE

- **O*NET Detailed Work Activities** (tab-delimited, 2,070 rows, no xlsx dependency): https://www.onetcenter.org/dl_files/database/db_20_1_text/DWA%20Reference.txt
- **Syllabus2O*NET** — the open-source method we're adapting (SBERT + cosine similarity over syllabus text): https://github.com/AlirezaJavadian/Syllabus-to-ONET
  - It targets a **2,070-DWA vector, i.e. O*NET 20.1** — the same release we use. That is the affirmative answer if a judge asks about dataset vintage.
- **Course-Skill Atlas** — peer-reviewed methodology paper: *Scientific Data* (Nature Portfolio), vol. 11, art. 1086, 4 Oct 2024, Javadian Sabet, Bana, Yu & Frank. https://www.nature.com/articles/s41597-024-03931-8
  - ⚠️ Their published *dataset* is aggregated at institution-major-year level and **cannot name individual courses.** We use their *method* against the GMU catalog, not their data.
- **GMU catalog (CourseLeaf)** ✅ VERIFIED: https://catalog.gmu.edu/courses/cs/ — also `/math/`, `/stat/`, `/it/`, `/engh/`, `/phys/`
- **GMU schedule of classes (Banner 8)** ✅ VERIFIED: https://patriotweb.gmu.edu/pls/prod/bwckschd.p_disp_dyn_sched/ — POST details in §9.1
- **Virginia Open Data Portal** — GMU enrollment and career-outcome datasets, optional enrichment: https://data.virginia.gov/organization/george-mason-university
- **Challenge rules (landing page):** https://www.stellic.com/pathfinders
- **Official Rules & Participant Terms** (binding; controls over any other materials): https://stellic.notion.site/pathfinders-official-terms — both teammates skim it once at registration.

**To fill in on day 1:** the GitHub repo URL, the Vercel deployment URL.

---

## 18. WHAT CHANGED ON AUG 13, AND WHY

A six-auditor adversarial review produced 114 findings; 82 survived verification. The load-bearing ones, and what they mean:

1. **§9.1 was factually impossible as written.** The GMU catalog contains no CRNs, no meeting times, no instructors, and no terms-offered prose. Sections live in Banner, a separate public system. `Course.termsOffered` — which feeds the urgency classification §15 says never to cut — had **no source at all**. Now two sources, both endpoint-verified.
2. **Three claims in §4 and §2 were false**, and all three would have been said out loud to Stellic: that Stellic Progress is a "flat checklist" (it ships multi-year planning, what-if scenarios, and Pathways), that "nobody does the student-facing version" (Lightcast — named in that same row — sells Career Coach to students), and that CS 330 is fall-only (it runs every term; anyone can pull the CRNs in 30 seconds).
3. **§8 could not survive contact with Structured Outputs.** Strict mode requires every field present, so non-nullable `expectedGraduation` forced the model to *invent* a graduation date that §11.1 then derived the entire urgency ranking from.
4. **`keeps-options-open` was uncomputable.** It needs role→skill membership; `extract-skills` returned only a cardinality. It would have silently rendered a duplicate of `max-coverage` on the screen that owns the largest block of the video.
5. **`SkillGap.covered` was structurally dead** — the algorithm returned a set difference, so the two-color chip map had no data for the first color.
6. **Every §14 command had a defect**: `--src-dir=false` is silently ignored, `toast` is deprecated and would have failed the whole `add` line atomically, and `pdf-parse` now installs a v2 rewrite whose API is entirely different.

**Verified independently before these edits landed:** the CourseLeaf page (200, 66 required-prereq blocks, 613 non-breaking spaces), the Banner POST (200, CS 330 CRNs 77905/77906/80167, 138 lecture rows / 23 lab rows), and the published versions of `create-next-app` (16.3.1), `pdf-parse` (2.4.5) and `openai` (7.4.0).

---

## 19. BUILD LOG — WHAT SHIPPED, AND WHERE IT DEVIATES FROM THIS SPEC

Built Aug 13 by an 8-agent workflow plus integration. `next build` passes with
zero warnings; all four §13 states have been driven in a real browser with zero
page errors (`npx tsx scripts/shoot-screens.ts`).

**Real data, all scraped live and committed:** 689 courses across CS/MATH/STAT/
IT/ENGH/PHYS · 274 with prereq text · 985 Fall 2026 sections across 327 courses ·
270 prereq rules · 2,070 O*NET DWAs. CS 330's CRNs came back 77905/77906/80167,
matching the §9.1 ground truth.

### Deviations from the spec as written, and why

1. **§11.3 step 6 `balanced` needed a `GAP_VALUE_WEIGHT`.** The formula is
   dimensionally broken: measured against the real skill map, gapValue is
   ~0.2–1.5 per course while `0.5 × heaviness` is ~1.75–2.0, so the penalty
   always outruns the reward and the maximum is the *smallest* combo. It
   rendered a 1-course card next to a 4-course one. Weight 5 on the coverage
   term makes them commensurate. See `scoreCombo` in `lib/schedules.ts`.
2. **A `requiredCount` secondary objective was added to all three comparators.**
   §11.3 scores only gap coverage, leaving every strategy indifferent to degree
   progress — so each comparator fell through to `totalCredits ASC`, actively
   preferring the smallest schedule. The result was 9-credit cards for a student
   with 36 credits left across 2 terms, with still-required, already-eligible
   courses (CS 321, CS 330, CS 405) dropped in favour of ENGH filler. Each
   strategy's own objective still decides first.
3. **`isUndergraduate` (course number < 500) filters eligibility.** 111 graduate
   courses have live Fall 2026 sections and 92 have no prereq rule at all, so
   they were trivially "eligible" and their long technical descriptions scored
   high. `CS 692 Special Topics in Systems and Networks` reached an
   undergraduate's schedule card with a real CRN. §0 rule 7.
4. **`/api/build-schedules` degraded path keeps the student's real combos** and
   writes prose locally, rather than serving fixture options. The combos in the
   request were computed deterministically by §11.3 and are already correct —
   only the prose needs the model. Showing a stranger's courses would be a worse
   and less honest degradation than real courses with local copy.
5. **`Section` was NOT restructured** for lecture+lab pairs; non-lecture rows are
   dropped at scrape time instead (§9.1), keeping §8 frozen. 33 sections across
   three terms have a second meeting block that is not represented.

### Key is in — what that changed (Aug 14)

- **`data/catalog-skills.json` is now real `text-embedding-3-small` output**, not
  the lexical stand-in. Sanity gate passes with CS 484 ∩ ENGH 302 overlap = 0 and
  11 of CS 484's 15 chips data/analysis-flavoured (lexical managed 3).
- **All three strict schemas are confirmed ACCEPTED by the live API** —
  `npx tsx scripts/check-openai.ts`. That includes the `pattern` keyword on
  `expectedGraduation`, which was the flagged §12.1 risk; it round-trips
  `"2027-05"` correctly. Re-run that script after any change to `lib/schemas.ts`.
- **Real embeddings surfaced two failures the lexical map had hidden**, both now
  fixed and both §0 rule 7 problems:
  1. `electiveLevelOk` in `lib/bottlenecks.ts` — a student past junior standing
     was being offered MATH 106 "Quantitative Reasoning" and STAT 260 after
     completing MATH 213 and STAT 344. Electives now carry a 300-level floor;
     still-required courses are exempt at any level, which is what keeps
     200-level CS 262 on the card.
  2. §12.2's prompt had a hard floor of "between 8 and 20 skills", which forced
     the model to pad — it mapped a backend-engineer posting onto "Prepare
     production storyboards" and put ENGH 492 **Advanced Fiction Writing
     Workshop** on the schedule. The floor is gone and cross-domain matching is
     now explicitly forbidden.
- **The `balanced` credit penalty is symmetric.** Penalising only the upper side
  made "balanced" mean "smallest", and once the level floor thinned the pool it
  settled on a 6-credit card. `FULL_TIME_CREDITS = 12` is the floor every
  registrar's office uses.

### ⚠️ pdf-parse needs `serverExternalPackages` or the upload path is dead in production

Found Aug 14 by reading the server log during a Playwright run. In a **production
build only** (`next start`, and therefore Vercel), every PDF upload threw:

```
Setting up fake worker failed: Cannot find module
  .next/server/chunks/pdf.worker.mjs
```

Turbopack bundles pdf-parse into the server chunks but does not emit pdfjs's
`pdf.worker.mjs` beside it. §12's catch then served the cached fixture, so the
route returned HTTP 200 with a perfectly plausible audit and `degraded: true` —
**the PDF path silently never parsed anything while still looking like it
worked.** `next dev` was fine, which is why nothing caught it earlier.

The fix is one line in `next.config.ts`:

```ts
serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
```

Confirmed after: `degraded: false`, 24 courses, 8 requirement blocks, correct
catalog year. **When you deploy, POST the sample PDF to the live URL and assert
`degraded === false`.** A 200 is not evidence the feature works — that is the
whole hazard of the never-show-an-error rule, and it is worth one sentence in
the write-up about how the failure was found.

### Prereq graph: SETTLED — keep the deterministic parser (Aug 14)

`build-prereqs.ts --compare` has now been run against the live API. **47 of 270
rules differ, and on the one CS course that differs the parser is right and the
model is wrong.**

> **CS 405** catalog text: `((CS 105^C, 105^XS, 110^C or 110^XS) and ...)`
> parser: `oneOf: [["CS 105","CS 110"]]` ✅ — an either/or group, as written
> model: `allOf: ["CS 105","CS 110"]` ❌ — requires BOTH

The demo student has taken CS 110 and not CS 105, so the model's version would
have marked CS 405 ineligible and silently dropped it off Options A and C. Every
other disagreement is a graduate PHYS/STAT course that `isUndergraduate` already
excludes, or a coreq-versus-prereq split where the parser's documented `^*`
handling (§9.2) is the correct reading.

**Do not overwrite `data/prereqs.json` with `build-prereqs.ts`.** The parser is
the reference: it reproduces §9.2's two verified ground-truth strings exactly and
asserts them on every run. `build-prereqs.ts` stays in the repo as the §9.2
implementation and as the comparison harness. This is a good write-up line — the
deterministic parser beat the model on the real data, and we have the diff.

Note: `tsx` does not read `.env.local`; only `next dev` does. Scripts needing a
key take it from the environment (`$env:OPENAI_API_KEY="..."` in pwsh).

### Three additions on Aug 14, all UI-only

No re-scrape, no re-embed, no change to `lib/types.ts` or `data/*.json`. Two of the
five judging criteria are design/experience and how-well-it's-built, and all three
of these render data the committed JSON already carried and nothing showed.

1. **`components/WeekGrid.tsx` — the week, drawn.** Compact on each option card,
   full size in the cart. It answers §16's "the three option cards are
   self-similar": three near-identical course lists become three visibly different
   weeks. It also makes the card's existing "✓ No time conflicts" claim checkable
   at a glance instead of taken on trust.
   **The vertical scale is computed once across every option and passed in.**
   Per-card bounds would draw three grids that look comparable while using three
   different scales. Async sections are never placed (§9.1 — 221 of 985 have no
   meeting time); they are named under the grid. The grid is `aria-hidden`: every
   surface that renders it already prints each meeting through `formatMeeting`, so
   exposing it would read the schedule twice. Block colour is
   `ScheduleCard.rowRole` (now exported), so grid and row tag cannot disagree.
2. **Section swap in the cart.** 117 committed courses have more than one Fall
   2026 section and the builder's pick used to be final — "the course is right,
   the 9 a.m. is not" is the one real decision the toggles cannot express.
   Alternates come from the raw catalog, not from `getEligibleCourses` (which caps
   at four sections and pre-filters by preferences). A conflicting alternate is
   shown DISABLED and names the course it collides with, using
   `sectionsConflict` — so `conflicts === []` (§8) stays true by construction and
   the checker is visibly doing work. A section that contradicts a live toggle is
   selectable and says so. The override is applied to the selected CARD as well as
   the cart: with it in the cart alone, the card read "TR 9:00 am · 79379" while
   the cart read "MW 3:00 pm · 79435" for the same course.
3. **"What if you take it later?" on urgent bottleneck cards.** `delayImpact` in
   `lib/bottlenecks.ts` reuses the restricted reverse graph and adds a
   longest-distance map beside `longestChain` (same back-edge guard, same reason).
   §2's thesis was stated in general while every number needed to say it about
   this audit already existed. On the sample student: CS 262 needs 3 terms and she
   has 2 — CS 367 breaks if it slips, and CS 471 is already outside the window.
   `atRisk` and `beyondWindowNow` are deliberately separate fields: saying "this
   breaks if you delay" about a course that is already unreachable is a false claim
   in the reassuring direction. No graduation date and no term name is ever
   asserted, because `expectedGraduation` is nullable and `termsRemaining` falls
   back to a credit-pace estimate.

Verified: `smoke-pipeline.ts` passes with four new §11.1 assertions
(`termsNeeded === chainDepth + 1`, both lists ⊆ `dependents`, the two lists
disjoint, flexible rows empty) · `next build` clean · axe WCAG 2.1 AA reports
**zero violations at any impact level** at 1440px and 390px across the diagnosis,
schedules and cart screens with both new disclosures open · no horizontal overflow
at 390px · every new control ≥ 24×24 (SC 2.5.8) · a swap changes the CRN and the
`/register` link, and leaves credits and gap counts untouched.

axe found one real defect in this work and it is worth keeping in mind: a 10px
time label at `opacity-70` over `--critical-soft` fails SC 1.4.3. Weight, not
opacity, carries secondary hierarchy in the grid now. Note also that scanning
mid-`animate-in` reports the entire screen as low contrast — let the 500ms fade
settle before believing an axe run.

The harness is now cross-platform. `scripts/audit-ui.ts` tries
`msedge → chrome → chromium →` Playwright's bundled Chromium in turn; the three
puppeteer scripts carry macOS and Linux paths beside the Windows ones. `audit-ui`
reports **AUDIT CLEAN** on macOS — no axe violations, no layout problems — and
`check-mobile` reports no horizontal scroll and no overflow anywhere.

Both harnesses flag one tap target under 24×24: the **`sr-only` `<input
type="file">`** in `AuditUpload.tsx`, which stays mounted after step 2 and so
appears on the schedules screen too. It is not a real SC 2.5.8 failure — the
visible target is the "Choose a file" button beside it — and `audit-ui` correctly
files it as a NOTE rather than a violation. `check-mobile` counts it as a FAIL;
that is the harness lacking an `sr-only` exemption, not a defect. Do not "fix" it
by making the input visible.

### Four follow-ups to the Aug 14 additions

Found by re-verifying the three additions above against the committed data.

1. **The cart's section picker is capped at 6** (`MAX_VISIBLE_SECTIONS`), of which
   at most 2 may be clashing (`MAX_VISIBLE_CLASHES`), with the current section
   pinned first and the rest chronological. It previously rendered EVERY section:
   fine for CS 405 (11 next term) and absurd for **ENGH 101 (74)** or **ENGH 302
   (140)**, both of which are in `getEligibleCourses` for the sample audit and held
   off a card only by `electiveLevelOk`'s 300-level floor — one manual-entry audit
   under `JUNIOR_STANDING_CREDITS` away from a 140-button list inside the cart. The
   clash cap exists because ordering by time distance alone put four disabled rows
   in CS 405's six: the sections nearest your current time are the ones most likely
   to collide with the rest of your week. Overflow goes to `bannerCourseUrl`, a new
   helper for Banner's `bwckctlg.p_disp_listcrse/` — ✅ verified live, HTTP 200,
   and it returns exactly the 11 CRNs `data/courses.json` carries for CS 405.
2. **`preferenceNotes` in `lib/schedules.ts`** now backs both `matchesPreferences`
   and the picker's "against your preferences" line. The picker had reimplemented
   the morning test as `section.startTime < "10:00"` — a STRING compare, which ranks
   9 a.m. after 10 a.m. and worked only because §9.1 happens to zero-pad the hour.
   This is the defect the picker's own doc comment warns about for
   `sectionsConflict`, committed one line below it.
3. **The asynchronous note no longer hides with the grid.** On a card, `week` is the
   scale shared across all options, so an all-async option rendered an empty
   bordered box; in the cart, `weekBounds` returns null for that set and took the
   "these are asynchronous" sentence down with it — exactly when the student most
   needs to be told why the week is empty. Both now gate the grid and the note
   separately.
4. **`DelayCost`'s summer/overload caveat always shows.** It was conditional on
   `beyondWindowNow`, but `termsRemaining` excludes summer outright (§11.1), so it
   is the same assumption behind `atRisk` too.

Re-verified after: `next build` clean · `smoke-pipeline.ts` ALL CHECKS PASSED ·
`audit-ui` AUDIT CLEAN · the picker renders 6 of 11 for CS 405 with a working
Patriot Web link, disables the two clashing rows and names what they collide with,
and a swap moves the CRN on the card, in the cart and in the `/register` link at
once · no horizontal overflow at 390px with every picker open · no page errors.

### Design system: one mono family, a real type scale, a palette with chroma

Three complaints, all about the same underlying thing — the screens were legible
but undifferentiated. Every change is presentational; no algorithm, no contract,
no `data/*.json`, and `lib/` is untouched except where a string is printed.

1. **JetBrains Mono, everywhere.** `--font-sans`, `--font-mono` and
   `--font-heading` all point at one variable font. The ~40 existing `font-mono`
   call sites on course codes and CRNs are now no-ops rather than font switches,
   which is why they did not need editing. `/register` is unaffected: its
   `BannerChrome` wrapper sets Arial inline, and a legacy SIS mock should not be
   in the product's typeface. **sonner needed an explicit override** — it injects
   `[data-sonner-toaster] { font-family: ui-sans-serif … }` at runtime, unlayered,
   so the toast was the last surface still rendering in the system sans. Beating
   it takes both an unlayered rule and specificity above 0,1,0.
2. **The type scale overrides Tailwind's own `--text-*` keys** rather than adding
   new names, so every existing `text-sm` / `text-lg` moved onto it without being
   touched. Six levels — 11 / 13 / 15 / 18 / 22 / 46 — each paired with a weight
   and a colour in `@layer base`, because the old ramp put body at 16 and a
   section heading at 18 and no reader perceives a 1.13x step as a level. Every
   size is *smaller* than its stock equivalent and tracking goes negative as size
   rises: mono sets every glyph on a 0.6em advance, so matching the old sizes
   literally would have overflowed the card headers.
3. **The palette.** Neutrals carry a little chroma now (blue-black ink at hue 265,
   warm paper at hue 92) instead of sitting at chroma 0. The bigger fix is the
   `-soft` fills: they were L 0.964–0.969, which against a 0.979 canvas is a
   difference you have to be *told* about, so the urgency tint on a bottleneck
   card and the covered/missing split on the gap chips both read as one pale grey.

> **Getting colour out of those fills is a LIGHTNESS move, not a chroma move,**
> and this is the part worth remembering. At L 0.945 sRGB holds only 0.026 chroma
> at the brand's hue — so the obvious fix of doubling chroma in place is silently
> clipped by the browser, which shifts the hue and can collapse two tokens into
> the same rendered colour. `scripts/check-contrast.ts` (new) caught exactly that
> on four of six. It parses the tokens straight out of `globals.css`, so it cannot
> drift from it, and asserts contrast, sRGB gamut, and fill separation. **Exits
> non-zero**, like `verify-prereqs.ts`.

**Two real regressions, both caught by the existing gates rather than by eye:**

- **`hover:bg-primary/80` on the primary button.** shadcn's default variant
  composites the primary at 80% over whatever is behind it. Fine when `--primary`
  is near-black; against the mid-lightness blue it lifts the fill toward the
  canvas and takes the white label to 3.2:1. axe flagged it serious. Fixed with a
  `--primary-hover` token that *darkens*, now asserted in `check-contrast.ts`.
- **The 24px tap-target floor.** `--text-xs--line-height: 1.45` made several
  `py-1 text-xs` links (CRN, instructor, "Why this?") compute to 23.95px, just
  under WCAG 2.2 SC 2.5.8, and `check-mobile.ts` failed them. 1.5 puts them at
  24.5px. The lesson is that those targets are sized by the line box, so the type
  scale is load-bearing for SC 2.5.8 and not only for looks.

**Copy.** Roughly halved on screen. The pattern was consistently *two elements
doing one job*: two ledes on State 1 (mechanism, then outcome — only the outcome
earns space above the fold), two O\*NET notes on the gap map, two "elective slot"
paragraphs on State 4, three stacked disclaimers in the cart, and a gap-map
sentence that restated the stat strip six inches above it. **Nothing factual or
legal was cut** — the advisor disclaimer is verbatim (`Footer.tsx` says not to
soften it), the O\*NET attribution survives in the one merged footer, the
simulated-SIS notice and the linked-lab caveat are whole, and State 2's privacy
disclosure is deliberately the longest lede left in the app because every clause
in it is a disclosure rather than a pitch.

Verified after: `next build` clean · `tsc --noEmit` clean · eslint clean (one
pre-existing unused-var warning) · `check-contrast` PALETTE CLEAN · `audit-ui`
AUDIT CLEAN, zero axe violations at 1440px and 390px across all six screens ·
`check-mobile` back to its documented baseline (the `sr-only` file input only) ·
`smoke-pipeline` ALL CHECKS PASSED · all four states re-shot with no page errors.

### Second design pass (Aug 15): two families, elevation, and one column on screen 3

The pass above made the screens legible. It did not make them look designed, and
three things gave that away. Everything here is presentational except one join
character in `lib/bottlenecks.ts`; no algorithm, no contract, no `data/*.json`.

1. **Geist and Geist Mono replace JetBrains Mono.** Both come from
   `next/font/google` — `Geist` and `Geist_Mono` are in Next 16's font list, so
   there is **no new npm dependency**. The previous pass pointed `--font-sans`,
   `--font-mono` and `--font-heading` at one family, which made all ~20
   `font-mono` utilities no-ops; they are real font switches again, which is why
   none of those call sites needed editing. Geist Mono now marks exactly the
   strings a student copies character by character — course codes, CRNs, meeting
   times, prereq-chain nodes — and nothing else.
   - The type scale went back up a step (12/14/16/19/24/30/36/44/52). Its old
     values were justified in a comment by mono's 0.6em advance; that premise is
     gone. `--text-xs--line-height` stays at 1.5 — it is still load-bearing for
     the SC 2.5.8 24px floor, now with more margin (12 × 1.5 + 8 = 26px).
   - `.eyebrow` tracking is back to 0.09em for the same reason.
   - `font-feature-settings: "calt" 0` moved off `body` and onto `.font-mono`
     and friends. Geist Mono ships no programming ligatures, but the strings the
     rule protected are still here — ScheduleOptions' `-CS 405, -3 credits` and
     the footer's `audit - your official audit` — so the guard stays where they
     live rather than suppressing contextual alternates in prose.
   - **`/register` pins Courier New inline.** `font-mono` there would have put
     the product's typeface inside the Banner mock, which sets Arial inline for
     exactly this reason.
2. **An elevation scale, `--shadow-e1/e2/e3`.** `ring-1 ring-foreground/10` was
   the *only* elevation idiom in the app, on ten different container types — a
   stat strip, a bottleneck card and the cart all sat at the same depth despite
   being three different kinds of object. Two layers per level (contact +
   ambient), tinted with the ink hue at 265 rather than neutral grey, because a
   grey shadow under blue-black ink on warm paper reads as dirt. A hairline ring
   stays under every shadow: cards are L 0.995 on an L 0.972 canvas and the
   shadow contributes nothing along the top edge. `check-contrast.ts` is
   unaffected — its regex only matches values that *start* with `oklch(`.
3. **The middot is gone as a design device** — 24 rendered sites plus
   `Bottleneck.reason`. One glyph was doing four jobs (stat separator, prose
   conjunction, list bullet, name delimiter), which is why it read as a tic.
   `components/Sep.tsx` is a hairline rule and does the one job worth keeping:
   separating countable facts in a readout. In prose it became punctuation; the
   "Teaches:" list got real `list-disc` markers. The three middots left in
   `app/api/build-schedules/route.ts` are inside the model prompt and never
   render.
4. **Screen 3 is one column, gaps first.** The two-column grid only existed at
   `lg:`, so below 1024px the gap map was already a second screenful after the
   last bottleneck card — the phone and the laptop told the story in two
   different orders. Now both read: facts → *What the jobs asked for* → *What's
   holding up your degree*. Bottleneck cards sit two-up with the hero
   (`showChain`) spanning both columns; gap chips flow `lg:grid-cols-2`. **Two
   columns and not three** — three fitted and truncated the DWA titles to
   "Analyze data to inf…", and §9.3 forbids shortening those strings by editing
   them, so the column has to be wide enough for CSS to do it honestly.
5. **Copy that restated a number six inches away is gone.** The step eyebrow on
   all four screens (the Stepper above already names the step); screen 3's lede
   (both its numbers are in the two stat strips below it); GapMap's `arithmetic()`
   sentence, its ranked-by caption and both `Group` notes; "Most waiting behind
   them first."; and on screen 4 the lede and the elective-slot paragraph merged
   into one line above the cards. **Nothing factual or legal was cut** — the
   O\*NET attribution, the advisor disclaimer, the linked-lab caveat, the
   simulated-SIS notice and the FERPA/OpenAI disclosure on State 2 are all
   verbatim.
6. **Schedule cards: the stat block went four lines to three**, and `WhyThis`
   lost its third paragraph, which restated the meeting time, instructor and CRN
   already printed in the two rows directly above it — three duplicated facts ×
   n courses × 3 cards, the single largest source of repetition on the screen
   that owns the biggest block of the video. `Why` and `Tradeoff` both stay
   visible: the tradeoff sentence is the only place a card admits a cost, on a
   screen whose whole job is comparison, and it is half the model's visible
   output on a submission where "the model wrote the reasoning; it did not pick
   the courses" is a §16 provenance beat.
7. **`Button` gained an `xl` size.** Five hero CTAs were each overriding `lg`
   with the same inline `h-11 px-5 text-base`. The `default` variant's
   `hover:bg-primary-hover` is untouched — its comment documents a measured axe
   regression.

Two defects the screenshots caught that no gate would have:

- **The three week grids started at three different heights.** Option A carries
  no diff line (it *is* the base) and the model-written labels run to one or two
  lines, so the grids the cards exist to let you compare were vertically
  offset. Fixed with a `min-h-[5.5rem]` slot holding the label and diff together.
- **The gap chips at three columns truncated to unreadability** — see item 4.

Verified after: `tsc --noEmit` clean · `next build` clean · eslint clean (three
pre-existing unused-var warnings, none in touched code) · `check-contrast`
PALETTE CLEAN, 46 tokens in gamut · `smoke-pipeline` ALL CHECKS PASSED ·
`audit-ui` **AUDIT CLEAN**, zero axe violations at any impact level at 1440px and
390px across all six screens, no horizontal overflow · `check-mobile` at its
documented baseline (the `sr-only` file input, on the two screens it stays
mounted for) · all six screens re-shot with no page errors.

### `/api/extract-skills` was returning real ids for skills it had invented (Aug 15)

Surfaced by `model returned no usable skills` firing during a manual run. That
error is caught and serves the fixture, so the flow never broke — which is why
the far worse bug underneath it had gone unnoticed.

**The model was being asked to copy an opaque key.** The prompt listed 1,411 rows
of `skillId<TAB>skillName` and the schema asked for `skillId` back. `gpt-4o`
cannot do that reliably over a list that size, and its failure is silent: it
emits a plausible name it INVENTED next to a real id belonging to something else.
Observed directly — it returned `4.A.2.b.2.I12.D02` labelled
*"Write production-quality software."*, which is not an O\*NET DWA at all. That id
is **"Create marketing materials."**

The two existing guards made it invisible rather than catching it:

- `scopedIds.has(s.skillId)` passed, because the id was genuinely in the list.
- §9.3's canonical-name lookup then *replaced* the invented name with the real
  name for that id — laundering a hallucination into a real, wrong DWA and
  rendering it on a backend engineer's gap map. §0 rule 7, in front of registrars.

**Fix: the NAME is the key and the id is derived.** DWA titles are unique across
all 2,070 rows of O\*NET 20.1 (verified), so this is sound. The model now returns
`{ skillName, postings }`, the route resolves the name to an id by exact match,
and anything that does not resolve is dropped. A wrong name is now a name that
does not exist, instead of a different skill. Ids are gone from the prompt too —
they were ~19 chars x 1,100 rows of pure liability. `demandCount` was also
dropped from the model's schema; the route already derived it.

**Two smaller fixes landed with it:**

- **Scoping now matches `lib/gaps.ts`.** That file already applies
  `isUndergraduate` when filling `SkillGap.closableBy`; the route did not, so a
  DWA taught only by MATH 776 or PHYS 685 could be demanded and then have nothing
  able to close it — which the gap map rendered as *"needs a prereq first"*, a
  false reason. It is not behind a prerequisite, it is behind a graduate course.
  1,411 → 1,136 offered DWAs, and it is where *"Measure dimensions of completed
  products or workpieces"* was entering an undergraduate's gap map.
- **One retry on the empty set,** with a nudge that states no minimum. The empty
  set used to fall straight through to the cached fixture, showing the student
  skills extracted from somebody else's two job postings — the trade §19 already
  settled the other way for `/api/build-schedules`.

> **DO NOT SET `temperature: 0` ON `callStructured`.** It is the obvious move on
> an extraction task and it was measured to make this materially worse. §12.2
> sorts the allowed list alphabetically, so greedy decoding walks it from the top
> and locks onto the first verb: at 0 it returned 20 consecutive *"Analyze ..."*
> entries with both programming activities absent. At 0.2 it added *"Analyze
> patient data."*; at 0.4 it drifted to *"Liaise between departments"* and
> **"Immunize patients."** for a data-science posting. The default temperature's
> variance is the lesser evil, and the retry above handles its empty tail.
> `lib/openai.ts` carries this warning at the call site.

`scripts/diag-skills.ts` (new, read-only) replays the route against the live API
and prints the raw model output beside each filter, so this class of failure is
attributable rather than guessable. It duplicates the system prompt — **re-copy
it if the route's rules change.**

Verified after: `tsc` clean · `next build` clean · **`check-openai.ts` confirms
the new `extractedSkillsSchema` is accepted by strict mode** (§19 requires this
after any `lib/schemas.ts` change) · `smoke-pipeline` ALL CHECKS PASSED ·
`audit-ui` AUDIT CLEAN · `check-contrast` PALETTE CLEAN · live route returns
`degraded: false` with *Write computer programming code*, *Assess database
performance* and *Develop database parameters or specifications* on the SWE
posting, and invented names now correctly dropped rather than renamed.

### §11.1 reasoned downstream only, and told a student to take a course she was locked out of (Aug 15)

Found by eye on the diagnosis screen: **CS 367 Computer Systems and Programming**
was rendered under *"Take this term or next"* while its own prerequisite CS 262
was still unmet. "This term" is not an option for that course. §11.1 measured only
what waits BEHIND a requirement — `chainDepth` over the reverse graph — and never
asked whether the student can START it. `prereqsSatisfied` was sitting in
`lib/bottlenecks.ts` the whole time; only `lib/schedules.ts` called it, so the
knowledge reached the schedule builder and never reached the label.

The same blind spot put **CS 471 Operating Systems** under *"Nothing is waiting on
these"* while CS 262's own delay panel listed it as *"already past your last 2
terms"* — two contradictory claims on one screen.

**`Bottleneck` gains `blockedBy` and `termsUntilEligible`** (additive; it appears
in no zod response schema, only the `/api/build-schedules` REQUEST body). The
classifier is now dimensionally complete:

```
pressure = termsUntilEligible + chainDepth + offeringPenalty
```

`termsUntilEligible` is the longest chain of unmet prereqs IN FRONT of a course —
`max` across `allOf`, `min` per `oneOf` group, same `visiting` back-edge guard
`longestChain` carries and for the same white-screen reason. Terms spent waiting
and terms spent being waited on both come out of the same runway, so both belong
in the same inequality.

**Two things worth remembering:**

1. **`blockedBy` is a flat AND-list, so an unmet `oneOf` group contributes exactly
   ONE representative.** CS 367 needs "CS 262 or CS 222"; emitting both rendered
   as *"Needs CS 222 and CS 262 first"*, which is false. The representative
   prefers a member that is in `remainingRequired` — CS 262 is on this student's
   audit and CS 222 is not, and sending her after a course she does not need would
   be its own §0 rule 7 failure.
2. **The red `unofferedCritical` banner was one code-move away from a checkably
   false claim.** `unofferedCriticals` returns anything critical missing from
   `eligible`, which fails on six different filters, but the copy asserts one
   cause: *"has no Fall 2026 section."* CS 367 has **8** live Fall 2026 sections
   and CS 471 has 5. `app/page.tsx` now passes only unblocked criticals; the
   blocked group carries the prereq explanation. The wider fix — a reason per
   course out of `getEligibleCourses` — is left undone and noted here.

The display partitions on **actionability first, urgency second**: `urgency` keeps
its three frozen values and `DiagnosisScreen` derives a fourth group, *"Can't take
yet, clear the prerequisite first"*, placed AFTER both actionable groups because
urgency is not an instruction when the course cannot be registered for. Cards keep
their urgency bar and ring, so a blocked-critical course still reads red. No new
palette token, so `check-contrast` is untouched.

Three more surfaces asserted the same false thing and were fixed with it:
`PrereqChain` hardcoded `TAKE THIS TERM` on the head node (it now draws an unmet
prereq as a `blocker` node labelled `TAKE THIS FIRST`, and the head reads `THEN
THIS`); `DelayCost` opened *"Taken next term…"* unconditionally; and
`completedPrereqsFor` filtered the chain's left node down to COMPLETED prereqs, so
the actual blocker was drawn nowhere. `delayImpact` is offset by
`termsUntilEligible` throughout — `termsNeeded = 1 + tue + deepest`, and the
at-risk/beyond-window thresholds shift with it, which correctly moves CS 471 from
"breaks if you delay" to "already unreachable" on CS 367's panel.

> **The hero falls back to a blocked row when nothing is actionable.** Drawing the
> chain only from `actionable` is right — its head says TAKE THIS TERM — but a
> student whose every remaining course is blocked then got no chain at all, which
> is exactly the student who most needs to see the sequence. That fallback is also
> the only thing that makes `PrereqChain`'s blocker node reachable; without it the
> branch is dead code.

Note for anyone re-checking this: **the live PDF path and
`samples/fallback-response.json` disagree.** The real `/api/parse-audit` run
(`degraded: false`) has this student already holding CS 321, CS 330 and CS 405, so
the browser shows 1 critical / 0 soon / 2 blocked / 2 flexible while the fixture
yields 3 / 3 / — / 2. Both are correct for their own input; do not "fix" one
against the other.

Verified after: `tsc --noEmit` clean · `next build` clean · eslint at its
documented baseline (two pre-existing unused-var warnings, none in touched
code) · `smoke-pipeline` **ALL CHECKS PASSED** with six new §11.1 assertions
(`blockedBy` ⟺ `termsUntilEligible > 0`, no blocker is an already-taken course,
every actionable row is registrable next term, a blocked row never outranks what
it waits on, `termsNeeded === chainDepth + termsUntilEligible + 1`, and the panel
and card agree on `termsUntilEligible`) · `audit-ui` **AUDIT CLEAN**, zero axe
violations at 1440px and 390px across all six screens · `check-contrast` PALETTE
CLEAN · `check-mobile` at its documented baseline (the `sr-only` file input) ·
all screens re-shot with no page errors · schedule cards unchanged, because
`mustTake` always filtered criticals through `eligible` — the builder was never
wrong, only the label was.

### The restyle branch, and what an audit found behind it (Aug 15)

Four commits landed on `restyle/flatten-ui` before this entry existed. Two are
presentational and two are correctness, and the split is worth recording because
the branch name only advertises the first kind.

1. **`d1e321c` — the four things that made the UI read as generated.** The brief
   was "get rid of all glow effects and gradients"; there were none — no
   `bg-gradient-*`, no coloured `shadow-[0_0_…]`, no `drop-shadow`, no keyframes.
   The complaint was real and the named cause was not. What produced it: the
   three-level **elevation scale** under 21 containers across four screens
   (deleted — `--shadow-e1/e2/e3` are gone and every container carries `border
   border-rule`, which draws all four edges where the shadow contributed nothing
   along the top); **`--radius` 0.625rem → 0.25rem**, one token that tightens the
   whole scale including the shadcn primitives hardcoding
   `rounded-[min(var(--radius-md),12px)]`; the gap map's **15 rounded-full pills
   on pastel fills**, which is both the most recognisable generated-UI component
   and wrong for data sorted by demand count (a pill reads as an unordered tag);
   and **voice** — the `<Sparkles/>` on the sample-postings button, pointing at
   two committed `.txt` files, plus four consecutive aphoristic headlines.
   > This reverses the elevation scale introduced one entry above. Both
   > decisions were argued from the same premise — §3 puts registrars and
   > provosts in the room — and the second one is right: **they read documents.**
   > The note in `globals.css` now says so at the token that used to exist.
2. **`13015db` — the gap map painted a grey block into the unfilled cell.** A
   regression from `d1e321c`, caught by rendering it. The new ruled table drew
   hairlines as `gap-px` over a `--rule` background, which is correct only when
   the row count is even; both groups on the sample audit are odd, so the last
   slot of the two-column grid had no cell and the container tint showed through
   as a solid rectangle, next to the real data. Per-cell borders now, with
   per-SIDE colours (`border-t-rule`) rather than the `border-rule` shorthand,
   which sets all four and would leave the 2px covered/missing left edge relying
   on stylesheet order.
3. **`aeeee0d` — screen 1 promised three schedules and the builder may return
   one.** §11.3 step 7 skips a strategy whose best combo another already claimed,
   and the step-8 floor returns exactly one; two cards is a correct outcome. This
   was invisible until `d1e321c` made screen 4's headline count what actually
   came back, at which point a two-card session had screen 1 promising three and
   screen 4 saying "2 ways" — the product contradicting itself inside one
   session. Screen 4's own sentence was already written defensively
   (`options.length === 3 ? "the three" : "they"`); screen 1 had never been given
   the same treatment.
4. **`1e030ef` — the browser scripts could not find a nix-store chromium.**
   `existsSync()` over hardcoded distro prefixes cannot match a content-addressed
   store path by construction, so `CHROME_PATH` takes precedence. Half the fix —
   see the Housekeeping note below, which stops requiring the env var at all.

**Then an audit of the whole tree.** It found the build in good shape — `tsc`
clean, zero `any`, zero `@ts-ignore`, zero TODO/FIXME markers, and every route
degrading rather than 500ing. (Re-counted while writing this: **zero non-null
assertions in `lib/`, `app/` and `components/`**, and 14 in `scripts/`, all of
them indexing into an array the loop bound already guarantees. §0 rule 1 —
offline scripts can be ugly, runtime code cannot.) The gaps clustered in three
places.

#### Screen 4 was the one flow that could strand the spinner forever

`runBuildSchedules` left `loadCatalog()` and `buildSchedules()` outside its try
and set `setIsWorking(false)` only on the happy path, and both call sites invoked
it bare from a click handler. A throw disabled every button on the screen for the
life of the page — no toast, no way forward. Every step-2 handler already did
this correctly.

**`loadCatalog` made that permanent.** It memoises its promise, which is the
point, but it memoised a REJECTED one too: one `ChunkLoadError` on the 850 KB
catalog and every later transition awaited the same rejection forever. It clears
the cache before rethrowing now, and the mount warm-up has a real `.catch` rather
than being an unhandled rejection.

**`fallbackProse` moved to `lib/prose.ts`.** The route already degrades correctly
on a model failure (deviation 4 above) — real combos, locally written prose —
but that function lived inside the route, so when the FETCH failed the client set
`options = []` and threw away combos it had computed deterministically moments
earlier. `Combo` was already exported from `lib/schedules.ts`, so the route's
byte-identical local copy is gone with it.

The empty state no longer names a cause. *"No conflict-free combination survived
those preferences"* is a specific claim about the search, and the client also
reached it on a failed request, on a malformed body, and with all three toggles
off. **`app/error.tsx` and `app/global-error.tsx` are new** — there was no error
boundary anywhere, and `page.tsx`'s header comment reasoned that no seam needs
one because every route degrades, which is true of the network seams and says
nothing about a render throw. `global-error` is styled inline: it replaces the
root layout, so `globals.css` and both `next/font` families are gone by the time
it renders. Both use **`retry`, not `reset`** — Next 16 documents `reset` as the
narrow case.

#### An OpenAI call could outlive the platform hosting it

`callStructured` set neither a timeout nor a retry count, inheriting the SDK's
10-minute × 3-attempt default, and no route declared `maxDuration`. Those combine
to defeat the one guarantee §12 asks of these routes: **a function killed at the
platform's limit is a 504 raised OUTSIDE the handler**, so the try/catch never
runs, `degraded` is never set, and the client gets the raw platform error. All
three routes declare `maxDuration = 60` (the ceiling without Fluid compute) and
`callStructured` takes a budget defaulting to 20s × 2 attempts.
`/api/extract-skills` passes `maxRetries: 0` because it is the only route that
can issue two sequential `gpt-4o` calls, and 2 × 20s fits where 4 × 20s does not.

#### `/api/parse-audit` served a stranger's degree progress under the student's name

See the §12 carve-out, which is where this is recorded rather than here, because
it reverses a product decision. Short version: the route degrades correctly, the
client read `degraded: true` and logged it, and the fixture behind THIS route is
a person's academic record rather than a list of skills. Gated on the entry
point, so the judge's path cannot reach it. `parseAuditPdf` also checks `res.ok`
now — Vercel's 4.5 MB cap raises a 413 above the handler and that body has no
`audit` at all.

#### A critical course could reach no card and no advisor list either

§11.3 step 2 promises a critical bottleneck makes every card or is named as "see
your advisor". `ineligibleCriticals` only reads the `rejected` map, which
`computeEligibility` fills at eligibility time. Three later paths in
`buildSchedules` drop an ELIGIBLE critical into neither place: the mustTake
prefix `break` (criticals sort chainDepth desc, so one bulky course can push
cheaper ones past the target), the group-credits `continue`, and `seatGreedily`
returning null.

**Measured against the committed data it does not fire** — the sample audit
yields one unblocked eligible critical at 3 credits, which fits under both
targets and seats against an empty `base` — so `unplacedCriticals` is
**report-only** and the `break` is untouched. It takes the combos rather than
reaching into the builder, so `buildSchedules`' signature does not move.

> The new reason is **`"did-not-fit"` and not a reuse of `"no-section"`**,
> because the course demonstrably HAS sections next term. That is the entire
> point of it, and it is the same bug class already fixed once for the red
> banner, in front of an audience that checks it from Patriot Web in 30 seconds.

It renders on **screen 4, not the diagnosis screen.** `ineligible` there is
computed with the DEFAULT preferences on purpose, and these drops are only
knowable with the live toggles — screen 4 is where those toggles are.
`ineligibilityCopy` and `joinCodes` moved to `lib/prose.ts` so two screens cannot
grow two voices for one verdict; the exhaustive switch is what forces the new
branch to be written rather than defaulted.

#### Three submission deliverables the repo said it had and did not

- **`.env.example` did not exist**, and `README`'s Setup block opens with
  `cp .env.example .env.local` — the documented first step of a fresh clone
  failed. It was also uncommittable: `.gitignore`'s blanket `.env*` would have
  swallowed it. Both fixed.
- **`TOOLS.md` omitted eleven shipped packages**, including the entire
  axe/Playwright harness that backs this section's own accessibility claims.
  Leaving out the tool that produced a claim we make in the write-up is the worst
  of the eleven to be missing (§3 makes the list a submission requirement). Also
  corrects `puppeteer-core` `^24` → `^25.7.0`.
- **`README` documented `build-prereqs.ts` as pipeline step 3**, which the entry
  above settled against. The runbook runs `parse-prereqs.ts` now and keeps the
  model version as the comparison harness. It also documented 6 of 17 scripts,
  with the eight gates — the actual test suite — absent entirely; they are a
  table now.

#### Housekeeping

`npm run verify` chains typecheck + lint + the three offline gates; the browser
gates get named `gate:*` entries because they need a running `npm start`. All
eight were hand-run with `npx tsx` and nothing in `package.json` mentioned any of
them. The unread `demanded` state is gone from `app/page.tsx`.

**The four browser scripts now share one `scripts/find-browser.ts`, and it looks
at `$PATH`.** This is the part `1e030ef` got half-right. That commit added a
`CHROME_PATH` override to the two puppeteer gates on the reasoning that a
nix-store path is content-addressed and therefore unguessable — correct, but the
conclusion "so you must set an env var" does not follow, because **the devshell
puts `chromium` on `$PATH` like any other tool** and nothing was looking there.
Four copies of a hardcoded absolute-path list, none of which consulted `$PATH`,
and a fourth script (`audit-ui.ts`) that had no override at all.

> Measured, not assumed, with a nix chromium FIRST on `$PATH` and `CHROME_PATH`
> unset: Playwright's `channel: "msedge"` resolves to `/opt/microsoft/msedge/
> msedge`, `"chrome"` to `/opt/google/chrome/chrome`, and **`"chromium"` is not
> a system-browser lookup at all** — it means Playwright's own build, at
> `~/.cache/ms-playwright/`, which is the same undownloaded bundle the final
> fallback wanted. Neither Playwright nor puppeteer-core ever consults `$PATH`.
> So all four steps of `audit-ui`'s ladder failed for one of two reasons, and
> the gate behind every accessibility claim in this file could not start.

Order is now `CHROME_PATH` → `$PATH` by binary name → the well-known install
paths. All four gates run with **zero configuration** in the devshell.
`make-sample-pdf.ts` keeps its own Windows entries on top of the shared list,
because those read the real `ProgramFiles` variables instead of assuming `C:`.

`shoot-screens.ts` also defaulted to **port 3112** while its own header comment
said to start the server with `npm run start`, which is 3000 — so the documented
invocation could not work, and its two sibling gates were already on 3000. Now
3000, `BASE_URL` still overrides.

> Note if you run `make-sample-pdf.ts` to test this: it **overwrites
> `public/sample-audit.pdf`**, and a different browser build produces a
> byte-different file (299,406 → 256,783 here). That asset is the one this
> section opens by calling the biggest remaining risk in the project. Revert it
> unless you actually meant to re-author it.

**Verified after, against a PRODUCTION build (`npm run build && npm start`):**
`tsc --noEmit` clean · `next build` clean · **eslint down to ONE warning**
(`scripts/scrape-catalog.ts` `_subject`; `demanded` was the other) ·
`smoke-pipeline` **ALL CHECKS PASSED** with eight new §11.3 assertions — per
preference variant, every critical is on every card or in the advisor list, and
no `"did not fit"` claim is made about a course with no section · `verify-prereqs`
exits 0 · `check-contrast` **PALETTE CLEAN**, 46 tokens in gamut · `audit-ui`
**AUDIT CLEAN**, zero axe violations at any impact level at 1440px and 390px
across all six screens, no layout problems · `check-mobile` at its documented
baseline (the `sr-only` file input, on the two screens it stays mounted for) ·
all six screens re-shot with no page errors.

Two things a gate cannot cover were driven by hand in a real browser:

- **POST `public/sample-audit.pdf` to the live `/api/parse-audit`** →
  `degraded: false`, 24 courses, correct catalog year. This path fails *only* in
  a production build, so a `next dev` pass is not evidence.
- **The two new failure paths.** Aborting `/api/build-schedules` mid-click still
  renders full cards from local prose, with no "No schedule came back" state and
  regenerate live again. An unreadable upload renders a complete diagnosis AND
  the new "we could not read your file" line; "use the sample audit" on the same
  build does not show it.

> **`unplacedCriticals`' new branch was confirmed non-vacuous** rather than
> assumed: stripping the criticals out of the combos returns CS 310 and CS 330 as
> `did-not-fit`, and both have live Fall 2026 sections, so the sentence it
> generates is true.

---

**The biggest remaining risk is `sample-audit.pdf`.** It is authored on Aug 14, before the pipeline that consumes it exists, and it silently determines whether the never-cut feature is visible at all. Zero critical bottlenecks → the bottleneck story vanishes from the schedule cards. Four or more → `mustTake` exceeds `targetCredits`, the combo set is empty, and State 4 renders nothing — a blank screen in the demo video. `slots = 0` → all three strategies score identically. The mitigation is already folded in: §11.3 steps 2/3/8 make an empty result unreachable, and Aug 17 carries a 30-minute checkpoint to tune **the PDF, not the algorithm**. Build the floor, then tune the input against it.
