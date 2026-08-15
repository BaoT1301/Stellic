// See CLAUDE.md §12. Shared OpenAI client + the one structured-output helper
// all three API routes go through.

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

// LAZY. `new OpenAI()` throws synchronously when the key is missing; at module
// scope that fires on first import, BEFORE the handler body, so it 500s outside
// the route's try/catch and the degraded fixture never renders.
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * How long one `callStructured` may take, at worst — `timeoutMs × (maxRetries + 1)`.
 *
 * This exists because the SDK's own defaults are a 10-minute timeout and 2
 * retries, i.e. a worst case of half an hour. That is not a timeout, it is the
 * absence of one, and it outlives every `maxDuration` in this app. A request
 * that hangs past the platform's limit is killed OUTSIDE the handler, so it
 * surfaces as a raw 504 that the route's try/catch structurally cannot see —
 * which is exactly the failure mode §12's "never returns 500" guarantee was
 * written to prevent. Bounding it here means a hung call throws, reaches the
 * catch, and degrades like every other failure.
 *
 * Defaults are sized against `maxDuration = 60` on every route: 20s × 2
 * attempts = 40s worst case, leaving 20s for the PDF parse, the body, and the
 * JSON. `/api/extract-skills` can issue TWO sequential calls, so it passes
 * `maxRetries: 0` to keep its own worst case at 40s rather than 80s.
 */
export interface CallBudget {
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 1;

/**
 * DO NOT SET `temperature: 0` HERE. It is the obvious move on an extraction
 * task and it was measured to make /api/extract-skills materially WORSE.
 *
 * Same two sample postings, same prompt, varying only temperature:
 *
 *   default  →  a mixed, sensible list: "Analyze data to identify trends",
 *               "Perform exploratory data analysis", "Write production-quality
 *               software". Count varies run to run (5-15).
 *   0        →  20 results, ALL of them consecutive "Analyze ..." entries, and
 *               both "Write computer programming code" and "Write
 *               production-quality software" absent. §12.2 sorts the allowed
 *               DWA list alphabetically by name, so greedy decoding walks it
 *               from the top and locks into the first verb it sees.
 *   0.2      →  same clustering, plus "Analyze patient data."
 *   0.4      →  drifts to "Liaise between departments", "Confer with managers",
 *               and "Immunize patients." for a data-science posting.
 *
 * The last two are §0 rule 7 / rule 9 failures — a wrong skill is what puts an
 * unrelated course on a student's schedule with a real CRN beside it, which is
 * the exact bug §19 already had to fix once. Variance is the lesser evil, and
 * /api/extract-skills handles the empty tail with a retry rather than by
 * turning the sampler down.
 */
export async function callStructured<T>(
  system: string,
  user: string,
  schema: ZodType<T>,
  schemaName: string,
  opts: CallBudget = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES } = opts;

  const res = await getClient().chat.completions.create(
    {
      // Pinned. `gpt-4o` is a floating alias and can move under us mid-build.
      model: "gpt-4o-2024-11-20",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    },
    { timeout: timeoutMs, maxRetries },
  );

  // No `!` non-null assertion here on purpose — it hid the refusal case from
  // TypeScript. JSON.parse(null) does not throw, it returns null, so the old
  // code returned `null as T`, sailed past the route's try/catch, never set
  // `degraded`, and crashed later in the UI as a blank screen.
  const c = res.choices[0];
  if (!c) throw new Error("no choice returned");
  if (c.message.refusal) throw new Error("refusal: " + c.message.refusal);
  if (c.finish_reason === "length") throw new Error("truncated");

  const content = c.message.content;
  if (typeof content !== "string" || !content) throw new Error("empty content");

  return JSON.parse(content) as T;
}
