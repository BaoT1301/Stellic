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

### Still provisional

- **`data/prereqs.json` came from the deterministic `scripts/parse-prereqs.ts`,**
  not from `build-prereqs.ts`. Run `build-prereqs.ts --compare` first — it writes
  nothing and diffs the model against the committed parser.

---

**The biggest remaining risk is `sample-audit.pdf`.** It is authored on Aug 14, before the pipeline that consumes it exists, and it silently determines whether the never-cut feature is visible at all. Zero critical bottlenecks → the bottleneck story vanishes from the schedule cards. Four or more → `mustTake` exceeds `targetCredits`, the combo set is empty, and State 4 renders nothing — a blank screen in the demo video. `slots = 0` → all three strategies score identically. The mitigation is already folded in: §11.3 steps 2/3/8 make an empty result unreachable, and Aug 17 carries a 30-minute checkpoint to tune **the PDF, not the algorithm**. Build the floor, then tune the input against it.
