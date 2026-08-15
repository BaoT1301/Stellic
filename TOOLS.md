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
| Tailwind CSS | ^4 | Styling (`@theme` in `app/globals.css` — no `tailwind.config.js`) |
| `@tailwindcss/postcss` | ^4 | The Tailwind v4 PostCSS plugin — how the CSS is actually built |
| shadcn/ui | ^4.18.0 | Component primitives (the CLI; components are vendored into `components/ui/`) |
| Base UI (`@base-ui/react`) | ^1.7.0 | shadcn's underlying primitive library as of July 2026 |
| sonner | ^2.0.8 | Toasts (shadcn's `toast` is deprecated) |
| next-themes | ^0.4.6 | Pulled in by shadcn's sonner wrapper. The app pins the toaster to `light` and ships no dark palette, so nothing else uses it. |
| lucide-react | ^1.31.0 | Icons |
| class-variance-authority | ^0.7.1 | Component variant definitions (`buttonVariants`) |
| clsx + tailwind-merge | ^2.1.1 / ^3.6.0 | The `cn()` helper in `lib/utils.ts` |
| tw-animate-css | ^1.4.0 | The `animate-in` / `fade-in` screen transitions |
| Geist | — | All prose — headings, body, ledes, buttons. Variable font, served self-hosted by `next/font/google`, so no request leaves the page at runtime. Licensed under the SIL Open Font License 1.1. |
| Geist Mono | — | Machine-readable strings only — course codes, CRNs, meeting times, prereq-chain nodes. Same variable-font and self-hosting story; also SIL Open Font License 1.1. |
| `next/font` | — | Self-hosts and subsets both fonts at build time |

## Data pipeline

| Tool | Version | Used for |
|---|---|---|
| cheerio | ^1.2.0 | HTML parsing for both scrapers |
| pdf-parse | ^2.4.5 | Degree-audit PDF → text (v2 — named `PDFParse` export) |
| zod | ^4.4.3 | Structured-output schemas + validation |
| tsx | ^4.23.12 | Running the offline scripts |

## Development and verification

Everything in this section is a **devDependency**. None of it ships to the
browser or runs on the server; all of it exists to gate a commit.

| Tool | Version | Used for |
|---|---|---|
| puppeteer-core | ^25.7.0 | Drives an already-installed Edge / Chrome / Chromium to walk the four UI states and screenshot them (`scripts/shoot-screens.ts`, `check-mobile.ts`). No bundled Chromium download. |
| playwright | ^1.62.1 | The other browser harness — `scripts/audit-ui.ts`, which is the one that can fall back to a bundled Chromium when no system browser is found |
| `@axe-core/playwright` + `axe-core` | ^4.13.0 | The WCAG 2.1 AA audit behind the "zero axe violations at 1440px and 390px" claim in CLAUDE.md §19. It is the tool that caught the `hover:bg-primary/80` contrast regression and the 23.95px tap targets. |
| eslint + eslint-config-next | ^9 / 16.3.1 | Linting |

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
