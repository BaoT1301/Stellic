// POST /api/parse-audit — CLAUDE.md §12.1
//
// multipart/form-data with a degree-audit PDF → pdf-parse v2 → raw text →
// OpenAI Structured Outputs → StudentAudit.
//
// THIS ROUTE NEVER RETURNS 500. §12: "The demo must never show an error state."
// Bad PDF, scanned PDF, oversized upload, missing API key, model refusal — all
// of it lands in one catch that logs server-side and serves the cached fixture
// with `degraded: true`. The client renders the fixture exactly the way it
// renders a live parse, so a judge clicking the link on a dead key still sees a
// working product rather than a stack trace.

import { PDFParse } from "pdf-parse"; // NAMED export. There is no default in v2.
import { callStructured } from "@/lib/openai";
import { studentAuditSchema } from "@/lib/schemas";
import type { StudentAudit } from "@/lib/types";
import fallbackResponse from "@/samples/fallback-response.json";

export const runtime = "nodejs";

// The JSON import types `status` as `string`, not the frozen literal union, so
// one cast at the boundary buys a properly typed fixture everywhere below.
const FALLBACK = fallbackResponse["parse-audit"] as unknown as {
  audit: StudentAudit;
  degraded: boolean;
};

// Vercel caps request bodies at 4.5 MB at the INFRASTRUCTURE level — a larger
// upload is rejected before this handler runs, so the catch below structurally
// cannot cover it. AuditUpload.tsx guards it client-side (§12.1); this is the
// belt to that suspenders, and it keeps a local `next dev` run honest too.
const MAX_PDF_BYTES = 4.5 * 1024 * 1024;

// A DegreeWorks-style audit that yields fewer characters than this is a scan or
// an image-only export. Sending it to the model just produces invented courses,
// which §12.1 explicitly forbids — fail into the fixture instead.
const MIN_TEXT_CHARS = 200;

// gpt-4o's context is large but a 40-page audit is mostly boilerplate. Trim
// rather than risk `finish_reason === "length"`, which callStructured throws on.
const MAX_TEXT_CHARS = 60_000;

const SYSTEM = `You extract structured data from university degree-audit documents (DegreeWorks, Stellic, Banner and institution-specific formats).

Rules:
- Extract ONLY what is present in the document. Never infer, complete or invent a course, a requirement or a number.
- Audit layouts differ at every institution. Work from the SEMANTIC content — headings, labels, checkmarks, "still needed" language — never from expected positions on the page.
- Course codes: normalize to "DEPT NNN" with a single space, uppercase department ("CS 262", "MATH 125"). Keep the department exactly as printed; do not translate it.
- coursesTaken: every course the audit shows as completed, in progress, or transferred in. Codes only.
- requirements: one entry per requirement block. "missing" holds the specific course codes the block still needs. "slotsOpen" is how many unfilled choices an elective bucket has, and is 0 for a named single-course requirement. "credits" is the credit count the block is worth.
- If a field is genuinely absent from the document, use null for catalogYear and expectedGraduation, and an empty array for a list. A wrong value is far worse than a null: a guessed graduation date silently changes which courses this student is told are urgent.
- expectedGraduation must be "YYYY-MM" ("Spring 2027" is "2027-05", "Fall 2027" is "2027-12", "December 2027" is "2027-12"). If the document does not state a term, return null.`;

/** Pull the PDF out of the form without depending on the client's field name. */
function findPdf(form: FormData): File | null {
  for (const key of ["file", "pdf", "audit", "auditPdf"]) {
    const v = form.get(key);
    if (v instanceof File && v.size > 0) return v;
  }
  for (const [, v] of form.entries()) {
    if (v instanceof File && v.size > 0) return v;
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Checked before the PDF work so the server log names the real cause. The
    // lazy client in lib/openai.ts would throw here anyway, just less legibly.
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const form = await req.formData();
    const file = findPdf(form);
    if (!file) throw new Error("no PDF file found in the multipart body");
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`PDF is ${Math.round(file.size / 1024)} KB, over the 4.5 MB limit`);
    }

    const data = new Uint8Array(await file.arrayBuffer());

    // pdf-parse v2 API. Anything handing you `const pdf = require('pdf-parse');
    // await pdf(buf)` is writing v1 and throws "pdf is not a function".
    // destroy() goes in a finally or the pdfjs worker leaks across requests.
    const parser = new PDFParse({ data });
    let text: string;
    try {
      const result = await parser.getText();
      text = result.text ?? "";
    } finally {
      await parser.destroy();
    }

    if (text.trim().length < MIN_TEXT_CHARS) {
      throw new Error(`PDF yielded only ${text.trim().length} characters of text`);
    }

    const audit = await callStructured<StudentAudit>(
      SYSTEM,
      `Degree audit text follows. Extract the student's record.\n\n---\n${text.slice(0, MAX_TEXT_CHARS)}\n---`,
      studentAuditSchema,
      "student_audit",
    );

    return Response.json({ audit, degraded: false });
  } catch (err) {
    console.error("[parse-audit] serving cached fixture:", err);
    return Response.json({ audit: FALLBACK.audit, degraded: true });
  }
}
