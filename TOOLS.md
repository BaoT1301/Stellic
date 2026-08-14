# Tools Used — Reverse Audit

Submission requirement for the Stellic Pathfinders Challenge: a complete list of
every tool, framework, library, SDK, and AI assistant used to build this project.

**Append to this file as you go. Do not reconstruct it on Aug 20.**

This list covers both the tools *used to build* the project and the tools the
project *depends on at runtime* — including AI coding assistants, not just the
runtime models.

---

## AI — used to build this project

| Tool | Used for |
|---|---|
| Claude Code (Anthropic) | Spec audit, code generation, scraper and API route implementation |

## AI — used at runtime by the product

| Tool | Used for |
|---|---|
| OpenAI `gpt-4o-2024-11-20` | Prereq-grammar parsing (offline), degree-audit extraction, job-posting skill extraction, schedule prose |
| OpenAI `text-embedding-3-small` | Course ↔ O*NET work-activity similarity (offline) |
| `openai` npm package (v7) | OpenAI API client + `zodResponseFormat` structured-output helper |

> We are using OpenAI rather than the Anthropic credits offered by the
> challenge. Tooling-partner products are optional under the rules.

## Framework and runtime

| Tool | Version | Used for |
|---|---|---|
| Next.js (App Router) | 16.3.1 | Framework, API routes |
| React | 19.2.8 | UI |
| TypeScript | ^5 | Language |
| Node.js | ≥22 | Runtime (global `fetch`, no `undici` dependency) |
| Vercel | — | Hosting |

## UI

| Tool | Version | Used for |
|---|---|---|
| Tailwind CSS | v4 | Styling (`@theme` in `app/globals.css` — no `tailwind.config.js`) |
| shadcn/ui | latest | Component primitives |
| Base UI | — | shadcn's underlying primitive library as of July 2026 |
| sonner | — | Toasts (shadcn's `toast` is deprecated) |

## Data pipeline

| Tool | Version | Used for |
|---|---|---|
| cheerio | ^1.2.0 | HTML parsing for both scrapers |
| pdf-parse | ^2.4.5 | Degree-audit PDF → text (v2 — named `PDFParse` export) |
| zod | ^4.4.3 | Structured-output schemas + validation |
| tsx | ^4.23.12 | Running the offline scripts |
| puppeteer-core | ^24 | **devDependency only.** Drives the Microsoft Edge already installed on the machine to walk the four UI states and screenshot them (`scripts/shoot-screens.ts`). No bundled Chromium download, nothing shipped to the browser. |

## Data sources

| Source | Access |
|---|---|
| GMU course catalog (CourseLeaf) — `catalog.gmu.edu/courses/*` | Public webpages, no credentials |
| GMU schedule of classes (Banner 8) — `patriotweb.gmu.edu` | Public self-service, no login |
| O*NET Detailed Work Activities 20.1 | Free public dataset — see attribution below |

---

## Required attribution

> Includes information from the O*NET 20.1 Database by the U.S. Department of
> Labor, Employment and Training Administration (USDOL/ETA). Used under the
> CC BY 4.0 license. O*NET is a trademark of USDOL/ETA.

---

## Not used

- No student information system (SIS) integration. No Ellucian, Banner API, or Ethos.
- No school credentials of any kind.
- No RateMyProfessors scraping — we construct a search URL and render it as a
  link the student's own browser follows.
- No database. No vector database. No Python.
