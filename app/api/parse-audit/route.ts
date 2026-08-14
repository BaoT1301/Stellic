// DAY-1 SMOKE TEST ONLY. See CLAUDE.md §12.1 for the real implementation.
//
// The single purpose of this file today is to prove that pdf-parse v2 imports
// and bundles in a Next.js App Router route handler ON VERCEL — not locally.
// The famous v1 `ENOENT ./test/data/05-versions-space.pdf` failure is gone in
// v2 and comes straight back if anyone pins ^1. Do not pin ^1.

import { PDFParse } from "pdf-parse"; // NAMED export. There is no default in v2.

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    pdfParseLoaded: typeof PDFParse === "function",
    note: "day-1 smoke test — real implementation lands Aug 17 per CLAUDE.md §15",
  });
}
