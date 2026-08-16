# Reverse Audit

**Tell it the job you want. It builds your whole next semester — required courses
in the right order, electives that close your skill gaps — and hands you the
cart.**

Built for the [Stellic Pathfinders Challenge](https://www.stellic.com/pathfinders).

---

## The problem

A degree plan tells you what's left. It doesn't tell you which boxes are
*load-bearing*.

1. **Sequencing.** Some required course sits at the head of a four-course chain.
   Miss it this term and you push an entire downstream sequence back a year.
   Nothing in a checklist marks that box differently from any other box.
   Institutions offer required courses when students need them only about 15% of
   the time, and 57% of students spend extra time and money as a result
   (*Ad Astra 2024 Benchmark Report*, 1.3M students).
2. **Choosing.** The handful of electives you actually get to pick are the only
   real decisions you make in four years, and they get filled based on what fits
   the schedule and what a friend said was easy. 52% of college graduates are
   underemployed within a year of graduating; 45% are still underemployed a
   decade later (*Talent Disrupted*, Strada Institute for the Future of Work and
   the Burning Glass Institute, February 2024).

Reverse Audit takes the job postings you'd want in two years and your degree
audit, and works backwards from the listing into the course catalog —
job posting → O*NET work activity → **a specific CRN you can register for next
term**, constrained by your remaining requirements and your prerequisite depth.

---

## The two-source public-data architecture

This is the part that makes the product deployable at any institution, and it is
the reason there is no SIS integration anywhere in this repo.

Every registrar's stack separates these two systems, so we read both:

| Source | What it publishes | How we read it |
|---|---|---|
| **Course catalog** (CourseLeaf, `catalog.gmu.edu/courses/*`) | Course codes, titles, credits, descriptions, prerequisite text, major restrictions | Public server-rendered webpages, parsed with `cheerio`. `robots.txt` allows `/courses/` — we never follow the disallowed `/search/` links, we read the canonical course code out of each anchor's `title` attribute instead. |
| **Schedule of classes** (Banner 8 self-service, `patriotweb.gmu.edu`) | CRNs, meeting days and times, instructors, modality, and — by sampling three terms — which terms a course is actually offered in | Public self-service HTML. **No login, no cookies, no session.** |

**Zero SIS integration required. No institutional credentials, no API key, no
procurement.** Both sources are public at essentially every US institution.

### Real vs. mocked

Everything public is real; everything that is a student's private record is
mocked.

- **Real:** the GMU course catalog, the GMU public schedule of classes, the job
  postings you paste in, and the O*NET Detailed Work Activities dataset.
- **Mocked:** the degree audit (`public/sample-audit.pdf`, a fictional student),
  the registration system (`/register`), and seat availability.

If we invented the courses we would also be inventing their prerequisites and
their skills, and the bottleneck graph and the gap map would be matching our
fiction against our fiction. Registration executes against a simulated SIS;
production would use the institution's student information system, which
requires an institution-issued API key that a student cannot obtain.

### Everything expensive happens offline

The course catalog does not change during a demo. So the scrape, the prerequisite
graph, and the skill embeddings all run **once, as local scripts**, and their
output is committed as static JSON in `data/`. The deployed Next.js app reads
those files and does no ML at runtime — no vector database, no cold starts.

At runtime there are exactly three OpenAI calls, all server-side:
`/api/extract-skills`, `/api/parse-audit`, and `/api/build-schedules`. The
bottleneck computation and the gap map run client-side with no API call at all,
and **the model never picks a course** — `lib/schedules.ts` chooses the combos
deterministically in TypeScript and the model only writes the prose.

---

## Setup

Requires **Node 22 or newer** (the `openai` v7 client needs it, and we rely on
global `fetch` rather than carrying an `undici` dependency).

```bash
npm install
cp .env.example .env.local
```

### OPENAI_API_KEY

Put your key in `.env.local`:

```
OPENAI_API_KEY=sk-...
```

`.env.local` is gitignored. The key is **server-side only** — it is read
exclusively inside `app/api/**` and is never exposed with a `NEXT_PUBLIC_`
prefix. The offline scripts in `scripts/` read the same variable.

Three scripts call OpenAI — `embed-skills.ts`, `build-prereqs.ts` (the
comparison harness only; the graph itself is built deterministically) and
`check-openai.ts`. Everything else in `scripts/`, and every screen of the
deployed app, runs without a key: each route catches the missing-key error and
serves its cached fixture rather than a 500.

Note that `tsx` does **not** read `.env.local` — only `next dev` does. Scripts
that need a key take it from the environment.

When deploying, set `OPENAI_API_KEY` in the Vercel project settings too —
`.env.local` is gitignored, so a missing dashboard variable is the single most
likely deploy mistake. Verify it on the live URL:

```bash
curl https://<your-deployment>/api/health
# -> {"hasKey":true}
```

### Run the app

```bash
npm run dev      # http://localhost:3000
```

---

## Running the offline scripts, in order

All scripts run from the **repo root** with `tsx`. They write into `data/`, and
those outputs are committed — you only need to re-run them when the catalog
changes or when you want to re-derive the graph.

```bash
# 1. Course catalog -> data/courses.json
#    Descriptions, credits, raw prerequisite text, major restrictions.
npx tsx scripts/scrape-catalog.ts

# 2. Schedule of classes -> merges sections + observed termsOffered into
#    data/courses.json. Pulls three terms (202670 Fall 2026, 202610 Spring 2026,
#    202570 Fall 2025) so "which terms is this offered" is observed, not guessed.
#    Sections come from Fall 2026 only — that is the only registerable term.
npx tsx scripts/scrape-sections.ts

# 3. Prerequisite grammar -> data/prereqs.json   [no key needed]
#    GMU does not write prose prerequisites; it emits a Banner-generated boolean
#    expression with grade codes as superscripts, so it is a grammar and it can
#    be parsed as one. Deterministic; every emitted course code is validated
#    against courses.json and the two ground-truth strings in CLAUDE.md §9.2 are
#    asserted on every run.
npx tsx scripts/parse-prereqs.ts

#    The MODEL implementation of the same step, kept as the §9.2 reference and
#    as a comparison harness. Do NOT use it to overwrite data/prereqs.json:
#    `--compare` against the live API disagrees on 47 of 270 rules, and on the
#    one undergraduate CS course among them the deterministic parser is right
#    and the model is wrong (CS 405's either/or group read as a hard AND, which
#    would have dropped the course off two schedule cards). CLAUDE.md §19.
npx tsx scripts/build-prereqs.ts --compare    # [needs OPENAI_API_KEY]

# 4. GATE. Prints dangling prerequisites, cycles, and the ten deepest chains.
#    EXITS NON-ZERO on a bad graph, so a broken graph is not committable.
#    Hand-check those ten chains against the real catalog before trusting the
#    bottleneck feature.
npx tsx scripts/verify-prereqs.ts

# 5. O*NET Detailed Work Activities -> data/onet-dwa.json
#    2,070 entries. No new dependencies, no key. Independent of steps 1-4, so it
#    can run while the scraper is still going.
npx tsx scripts/fetch-onet.ts

# 6. Course <-> work-activity similarity -> data/catalog-skills.json
#    [needs OPENAI_API_KEY, needs steps 1 and 5]
npx tsx scripts/embed-skills.ts
```

### Demo assets

```bash
# samples/sample-audit.html -> public/sample-audit.pdf
# No key, no network. Tries puppeteer, then any headless Chrome/Edge already on
# the machine, then a built-in minimal PDF writer. Verifies with pdf-parse that
# the result contains real extractable text before it reports success.
npx tsx scripts/make-sample-pdf.ts

# Force the no-browser path, to check the fallback still works:
SAMPLE_PDF_FORCE_FALLBACK=1 npx tsx scripts/make-sample-pdf.ts
```

`samples/sample-job-swe.txt` and `samples/sample-job-data.txt` are the two
postings behind the app's sample-fill button. `data/degree-template.json` is the
BS Computer Science requirement template used by the manual-entry path when a
student has no audit PDF.

### The gates

Nothing above is a test suite. These are, and they are the ones to run before a
commit. `npm run verify` chains the three offline ones; the browser ones need a
`npm run build && npm start` first and are wired up as npm scripts too.

The browser gates drive a Chromium-family browser you already have. They find it
via `scripts/find-browser.ts`, which checks `CHROME_PATH`, then `$PATH` by binary
name, then the well-known install paths — so on any machine with `chromium` on
`$PATH` (including a nix devshell, where the store path is unguessable by
construction) they need no configuration. Nothing here downloads a browser;
`npx playwright install` is not part of this project's setup.

| Script | npm script | Checks | Exits non-zero |
|---|---|---|---|
| `smoke-pipeline.ts` | `verify` | §11.1/§11.2/§11.3 end to end against the committed data and the sample audit — bottleneck arithmetic, gap partitioning, and every schedule invariant across all four preference toggles | yes |
| `verify-prereqs.ts` | `verify` | Dangling prerequisites, cycles, the ten deepest chains | yes |
| `check-contrast.ts` | `verify` | Parses the tokens straight out of `app/globals.css` and asserts WCAG contrast, sRGB gamut, and separation between the `-soft` fills | yes |
| `audit-ui.ts` | `gate:ui` | Playwright + axe over all six screens at 1440px and 390px. WCAG 2.1 AA, plus layout and overflow | yes |
| `check-mobile.ts` | `gate:mobile` | Horizontal overflow and 24×24 tap targets at 390px | yes |
| `shoot-screens.ts` | `gate:screens` | Drives all four states in a real browser and screenshots them | yes, on a page error |
| `test-audit-paths.ts` | `gate:audit-paths` | Manual entry (`auditFromManual` + `degree-template.json`) and dropzone PDF upload — the two ways into the app that the screenshot walk never touches | yes |
| `check-openai.ts` | `gate:schemas` | That every schema in `lib/schemas.ts` is accepted by Structured Outputs' strict mode. **Re-run after any change to that file.** `[needs OPENAI_API_KEY]` | yes |
| `diag-skills.ts` | — | Read-only replay of `/api/extract-skills` printing the raw model output beside each filter. `[needs OPENAI_API_KEY]` | no |

All eight gates pass clean, with no standing baseline failures and no notes. Two
of them count tap targets against WCAG 2.2 SC 2.5.8 and both skip the same two
kinds of non-target: anything classed `sr-only` (the dropzone's file input,
which has a visible "Choose a file" button beside it) and anything
`aria-hidden` (Base UI's `Switch` renders a 1×1 form-participation checkbox
next to the real `role=switch` control). The visible controls are measured
normally.

One more script has no gate role and is kept for provenance:
`map-skills-lexical.ts`, the lexical stand-in that `embed-skills.ts` replaced —
CLAUDE.md §19 records what the real embeddings caught that it had hidden.

---

## Repo layout

```
scripts/      offline pipeline + the gates. Slow and ugly is fine here.
data/         committed JSON the deployed app imports statically.
samples/      sample job postings, the audit source HTML, the degraded fixture.
lib/          types.ts (frozen contracts), bottlenecks, gaps, schedules, rmp,
              openai (the one callStructured helper), schemas (zod, strict-mode
              safe), prose (copy written without the model), utils.
app/          one page with four states, /register, four API routes, and the
              two error boundaries.
components/   the UI.
```

`lib/types.ts` is the frozen data contract. `data/*.json` is read with a static
`import`, never `fs.readFile` — a runtime path built from `process.cwd()` is
frequently not traced into the Vercel bundle.

---

## Notes on what we deliberately do not do

- **We never fetch RateMyProfessors.** We construct a search URL and render it as
  a plain hyperlink; the student's browser makes the request, our server never
  does. We aren't asserting a rating, we're saying "go look."
- **We never claim "all prerequisites met."** Prerequisite rules carry a minimum
  grade, but a degree audit's course list carries no grades, so the UI says
  "prereq courses completed" — the stronger claim would be false for a student
  with a D.
- **No database, no persistence.** State lives in React; the catalog ships as
  static JSON.
- Every API route degrades to a cached fixture rather than an error state — with
  one carve-out. If you upload **your own** audit and it cannot be read, the
  diagnosis screen says so, because the fixture behind that particular route is
  another student's academic record and everything downstream would otherwise
  present it as yours. Clicking "use the sample audit" never shows that line:
  there, the fixture is exactly what the button promised.

Suggestions are based on public job postings and course descriptions. Confirm
with your advisor before registering.

---

## Attribution and licensing

Includes information from the O\*NET 20.1 Database by the U.S. Department of
Labor, Employment and Training Administration (USDOL/ETA). Used under the
CC BY 4.0 license. O\*NET is a trademark of USDOL/ETA.

Method adapted from
[Syllabus2O\*NET](https://github.com/AlirezaJavadian/Syllabus-to-ONET) and the
Course-Skill Atlas methodology paper (Javadian Sabet, Bana, Yu & Frank,
*Scientific Data* 11:1086, 2024). We use their *method* against the GMU catalog,
not their dataset, which is aggregated at institution-major-year level and
cannot name individual courses.

Nearest prior art on the recommendation side: Frej et al., *"Course Recommender
Systems Need to Consider the Job Market,"* SIGIR 2024.

See [`TOOLS.md`](./TOOLS.md) for the complete list of frameworks, libraries,
models, and AI coding assistants used to build this.
