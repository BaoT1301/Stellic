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

export async function callStructured<T>(
  system: string,
  user: string,
  schema: ZodType<T>,
  schemaName: string,
): Promise<T> {
  const res = await getClient().chat.completions.create({
    // Pinned. `gpt-4o` is a floating alias and can move under us mid-build.
    model: "gpt-4o-2024-11-20",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: zodResponseFormat(schema, schemaName),
  });

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
