// POST /api/chat — the grounded academic-planning assistant.
//
// CLAUDE.md §5 closed "free-form chat interface" on the grounds that a chat box
// "cannot break in a live demo" is a claim structured buttons make for free. The
// owner has overridden that decision, so this route has to earn the same
// property structurally instead:
//
//   1. THE MODEL SEES NOTHING BUT THE STUDENT'S OWN DATA. The context block is
//      built by lib/chat-context.ts from state the page already computed. The
//      catalog, the prereq graph and the section list are never in the prompt,
//      so there is nothing here for the model to browse and mis-quote.
//   2. THIS ROUTE NEVER RETURNS 500, AND NEVER RETURNS NOTHING. Missing key,
//      dead network, malformed body, mid-stream failure: every path ends in a
//      real answer written by `answerFromContext`, from the same numbers the
//      model would have read. A degraded answer is a different SENTENCE, never
//      a different FACT.
//   3. INPUT IS CAPPED IN THREE PLACES. Raw body bytes, message count, and
//      per-message length. A demo laptop with a stuck key cannot turn one click
//      into a very long prompt.
//
// Streaming: a plain `text/plain` stream of the answer, not SSE. There is no
// structured payload to frame, the client renders the text as it arrives, and
// the degraded path returns the identical content type with the same header, so
// components/ChatPanel.tsx has exactly one code path for reading a reply.

import OpenAI from "openai";

import {
  answerFromContext,
  normalizeContext,
  serializeChatContext,
  type ChatContext,
} from "@/lib/chat-context";
import { NEXT_TERM_LABEL } from "@/lib/types";

export const runtime = "nodejs";
// Generous enough for a slow first token, short enough that a hung upstream
// cannot hold the demo. The SDK timeout below fires first in practice.
export const maxDuration = 30;

// Pinned, exactly as §6 pins the extraction model. `gpt-4o` is a floating alias
// and can move under us mid-build; "the assistant started hedging differently"
// is not a bug anyone wants to debug on August 20.
const MODEL = "gpt-4o-2024-11-20";

/** 2 to 4 sentences at ~20 tokens a sentence, with headroom. Capping output is
 *  also a UX decision: a wall of text in a docked panel is unreadable. */
const MAX_OUTPUT_TOKENS = 320;
const REQUEST_TIMEOUT_MS = 20_000;

// Three independent caps. The body cap is the only one that can be checked
// before parsing, so it is deliberately generous: a realistic context block with
// three options is 20 to 40 KB of JSON.
const MAX_BODY_CHARS = 256_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1_200;

interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `You are the academic planning assistant inside Reverse Audit, a tool that reads an undergraduate's degree audit and builds their ${NEXT_TERM_LABEL} schedule. You are talking to that student about their own plan.

THE CONTEXT MESSAGE IS YOUR ONLY SOURCE OF FACTS.
- Never state a course code, course title, CRN, meeting time, instructor, prerequisite, credit count, requirement or skill that is not written in the context.
- Never compute a new statistic. If a number is not in the context, you do not have it.
- If the answer is not in the context, say so plainly in one sentence and tell the student what to check with their advisor or in the University Catalog. That is a good answer, not a failure.
- The audit records which courses were completed, not the grades. Say "the prerequisite courses are completed", never "all prerequisites are met".

NEVER PROMISE AN OUTCOME.
- Never tell the student they will graduate on time, and never say a schedule guarantees, secures or protects anything. You may repeat the urgency the context assigns a course and the reason it gives, and then stop.
- Do not characterise their overall progress. The phrases "on track", "stay on track", "you'll be fine", "no problem" and "safe" are banned. Report what the context says about the course in front of you.
- Do not tell the student a course is easy, hard, good or bad. You have no data on that.
- Suggestions here are not an official degree audit. Any answer about timing, consequences or what to register for ends by saying their advisor and their official audit govern.

HOW TO WRITE.
- 2 to 4 sentences. Plain language a first-year student reads once and understands.
- No markdown headers, no bullet lists, no bold, no emoji, no greetings, no exclamation marks.
- Refer to a course by its code and its title the first time, for example "CS 262 Introduction to Low-Level Programming", then by code.
- Address the student as "you". Be concrete: name the actual courses and skills from the context rather than describing them in general terms.
- Never mention "the context", "the data provided", "the information I have" or yourself as an assistant. State the fact directly. When you do not have something, name what you looked in: "CS 475 is not in your audit or your ${NEXT_TERM_LABEL} options, so I do not have anything on it."`;

function reply(text: string, degraded: boolean): Response {
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells the panel to show its "answered directly from your data" note.
      "X-Degraded": degraded ? "true" : "false",
      // Nginx-style proxies buffer text/plain by default, which turns a stream
      // into a single late blob. Vercel honours this hint.
      "X-Accel-Buffering": "no",
    },
  });
}

/** Drop anything that is not a `{ role, content: string }` pair, then cap both
 *  the count and the length. Rejecting rather than coercing: a non-string
 *  content is a client bug or an attack, and neither should reach the model. */
function sanitizeMessages(input: unknown): WireMessage[] {
  if (!Array.isArray(input)) return [];
  const clean: WireMessage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;
    clean.push({ role, content: trimmed.slice(0, MAX_MESSAGE_CHARS) });
  }
  // Keep the TAIL of the conversation: the last exchange is what the question
  // refers to, and dropping the oldest turns is the cheap correct truncation.
  return clean.slice(-MAX_MESSAGES);
}

/** The last thing the student actually asked. Drives the degraded answer. */
function lastQuestion(messages: WireMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return "";
}

export async function POST(req: Request): Promise<Response> {
  // Hoisted so every catch below can still write a TRUE answer rather than an
  // apology. This is the same reasoning app/api/build-schedules/route.ts uses to
  // keep the student's real schedule when only the prose call died.
  let context: ChatContext = normalizeContext(null);
  let question = "";

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      // Nothing parsed, so there is no context to ground a real answer in. Say
      // the true thing about what happened.
      console.error("[chat] body too large:", raw.length);
      return reply(
        "That request was too large for me to read. Reload the page and ask again, and keep the question to a sentence or two.",
        true,
      );
    }

    const body = JSON.parse(raw) as { messages?: unknown; context?: unknown };
    context = normalizeContext(body?.context as ChatContext | null);
    const messages = sanitizeMessages(body?.messages);
    question = lastQuestion(messages);

    if (messages.length === 0 || question === "") {
      return reply(
        "I did not get a question. Ask me about a course by its code, about one of your options, or about a skill your postings asked for.",
        true,
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      // The common state until the Vercel env var is set. The student still gets
      // a real, specific answer computed from their own audit.
      throw new Error("OPENAI_API_KEY is not set");
    }

    // Lazy, inside the handler: `new OpenAI()` throws synchronously on a missing
    // key, and at module scope that fires before this try block exists (§12).
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const stream = await client.chat.completions.create(
      {
        model: MODEL,
        // Low but not zero. The answers are factual restatements; variation
        // between two runs of the same question on camera reads as instability.
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM },
          // Separate system message rather than appended to the instructions, so
          // the boundary between "how to behave" and "what is true" is explicit.
          { role: "system", content: serializeChatContext(context) },
          ...messages,
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    // Awaiting `create` above means the upstream response headers already
    // arrived: a bad key, a rate limit or a dead network has thrown by now and
    // is being handled by the catch, with the degraded answer, before a single
    // byte of this response is committed.
    const encoder = new TextEncoder();
    const answerStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Once the client cancels, `enqueue` and `close` throw on the dead
        // controller. Unguarded, that rejects this async callback and surfaces
        // as an unhandled rejection in the server log for something that is not
        // an error at all: the student closed the panel.
        const write = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            /* the reader went away */
          }
        };

        let emitted = 0;
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              emitted += delta.length;
              write(delta);
            }
          }
          if (emitted === 0) {
            // A refusal, or a completion with no content. Neither is an error
            // upstream, and both are a blank bubble on screen.
            write(answerFromContext(context, question));
          }
        } catch (err) {
          console.error("[chat] stream failed mid-answer:", err);
          write(
            emitted === 0
              ? answerFromContext(context, question)
              : "\n\n(That answer stopped early. Everything above came from your audit and the public schedule of classes. Ask again, or check it with your advisor.)",
          );
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed by the cancel path */
          }
        }
      },
      cancel() {
        // The student closed the panel or asked something else. Stop paying for
        // tokens nobody will read.
        try {
          stream.controller?.abort();
        } catch {
          /* the SDK already tore it down */
        }
      },
    });

    return new Response(answerStream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Degraded": "false",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    // Missing key, malformed JSON, upstream 401/429/timeout. All of them end
    // here, and all of them still answer the question from the student's data.
    console.error("[chat] answering locally:", err);
    return reply(answerFromContext(context, question), true);
  }
}
