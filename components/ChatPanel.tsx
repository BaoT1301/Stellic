"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Square, X } from "lucide-react";

import {
  answerFromContext,
  contextFacts,
  hasGrounding,
  suggestedQuestions,
  type ChatContext,
} from "@/lib/chat-context";
import { NEXT_TERM_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The assistant. CLAUDE.md §5 closed free-form chat; the owner reopened it, and
 * the reason it was closed in the first place is the spec this component is
 * written against: it has to be impossible to break on camera.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A DOCKED BAND AND NOT A FLOATING BUBBLE
 *
 * A fixed-position bubble sits on top of the schedule cards, which is exactly
 * the screen a judge is reading when they would want to ask a question, and on
 * a 390px phone it covers a third of one. So this renders INLINE, in the page
 * flow, as an ink band the orchestrator places under the cards. It occludes
 * nothing, it cannot trap the pointer, and it survives being screenshotted.
 *
 * Because it is not modal it does not trap focus: a focus trap on a non-modal
 * region is the wrong pattern and strands keyboard users behind an invisible
 * wall. What it does instead is the correct half of that contract. Focus moves
 * into the input when the student expands the panel to type, Escape collapses
 * it, and focus returns to the control that opened it.
 *
 * WHY THE CHIPS ARE VISIBLE WHILE COLLAPSED
 *
 * The three questions are built from THIS student's data by
 * lib/chat-context.ts, and every one of them is answerable with no model at
 * all. A judge taps one, the panel expands, the answer streams. That is the
 * whole feature in ten seconds, and it still works with a dead OPENAI_API_KEY
 * or no network, which is what "cannot break in a live demo" has to mean.
 * ---------------------------------------------------------------------------
 */

export interface ChatPanelProps {
  /**
   * The student's current state. Everything the assistant is allowed to know,
   * assembled in app/page.tsx from the audit, bottlenecks, gaps and schedule
   * options it already holds. See lib/chat-context.ts for the shape.
   */
  context: ChatContext;
  /**
   * Called when the student collapses the panel, by the close control or by
   * Escape. Optional: the panel collapses itself either way, so a parent that
   * wants it mounted permanently can leave this out. Provide it only to
   * unmount, scroll, or record the dismissal. If it unmounts the panel, move
   * focus yourself, because the control focus would have returned to is gone.
   */
  onClose?: () => void;
  /** Render expanded on first paint. Default false: collapsed, chips showing. */
  defaultOpen?: boolean;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Written from the student's own data rather than by the model. */
  degraded?: boolean;
  /** Waiting on the first token. */
  pending?: boolean;
}

/** Conversation turns sent upstream. The route caps this again server-side. */
const MAX_HISTORY = 12;
const MAX_INPUT_CHARS = 300;

let counter = 0;
const nextId = () => `m${++counter}`;

/**
 * Course codes and CRNs inside an answer are set in `.data`, exactly as they
 * are on the schedule cards. A student copying a CRN out of a sentence should
 * be reading the same glyphs they will read on the card and type into Banner.
 */
const TOKEN_PATTERN = /([A-Z]{2,4}\s?\d{3}\b|\b\d{5}\b)/g;

function Grounded({ text }: { text: string }) {
  const parts = text.split(TOKEN_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="data font-medium">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Focus ring for the dark surface. The default ring token is tuned against
 *  paper and measures badly on ink, and SC 1.4.11 wants 3:1 for the indicator
 *  that identifies focus. ink-fg on ink is 16:1. */
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-fg";

export function ChatPanel({
  context,
  onClose,
  defaultOpen = false,
  className,
}: ChatPanelProps) {
  const headingId = useId();
  const inputId = useId();

  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const focusInputNext = useRef(false);
  const focusOpenerNext = useRef(false);

  const questions = useMemo(() => suggestedQuestions(context), [context]);
  const facts = useMemo(() => contextFacts(context), [context]);
  const grounded = hasGrounding(context);

  // Abort any answer still streaming when the panel unmounts, so a closed tab
  // does not leave a reader spinning on a dead body.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Focus moves AFTER the render that swaps the composer for the opener, or
   * the other way round. Calling .focus() inside the click handler would run
   * against the element that is about to be removed. The flags are set at the
   * call site rather than inferred from `open`, because opening via a suggested
   * question must NOT steal focus out of the answer that is arriving.
   */
  useEffect(() => {
    if (open && focusInputNext.current) {
      focusInputNext.current = false;
      inputRef.current?.focus();
    }
    if (!open && focusOpenerNext.current) {
      focusOpenerNext.current = false;
      openerRef.current?.focus();
    }
  }, [open]);

  // Keep the newest turn in view. The CONTAINER scrolls, never the page, so the
  // schedule cards above never move under a judge mid-read.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el || messages.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages]);

  const patch = useCallback((id: string, next: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    focusOpenerNext.current = true;
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, MAX_INPUT_CHARS);
      if (question === "" || busy) return;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        content: question,
      };
      const answerId = nextId();

      // Taken from the state this handler was rendered with, which is correct
      // because `busy` makes two sends mutually exclusive.
      const history = [...messages, userMessage]
        .filter((m) => m.content.trim() !== "")
        .slice(-MAX_HISTORY)
        .map(({ role, content }) => ({ role, content }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: answerId, role: "assistant", content: "", pending: true },
      ]);
      setInput("");
      setBusy(true);
      setOpen(true);
      setAnnouncement("Answering.");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, context }),
          signal: controller.signal,
        });

        // The route never returns 500 and never returns an empty body, so there
        // is deliberately no status branch here: whatever came back IS the
        // answer, and the header only decides whether we label its provenance.
        const degraded = res.headers.get("X-Degraded") === "true";

        if (!res.body) {
          // No streaming reader in this browser. Same content, one chunk.
          const text = await res.text();
          patch(answerId, { content: text, degraded, pending: false });
          setAnnouncement(text);
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let text = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            patch(answerId, { content: text, pending: false });
          }
          text += decoder.decode();
          patch(answerId, { content: text, degraded, pending: false });
          setAnnouncement(text);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Stop was pressed, or the panel closed. Keep whatever arrived; drop
          // an answer that never started rather than leaving an empty bubble.
          setMessages((prev) =>
            prev.filter((m) => m.id !== answerId || m.content.trim() !== ""),
          );
          setAnnouncement("Stopped.");
        } else {
          // The request itself failed, so the route's own degraded path never
          // ran. Same function the route would have called, same facts, so the
          // student still gets a true answer with no network at all.
          console.error("[chat] request failed, answering locally", err);
          const local = answerFromContext(context, question);
          patch(answerId, { content: local, degraded: true, pending: false });
          setAnnouncement(local);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, context, messages, patch],
  );

  // Nothing to ground an answer in means nothing to render. The panel must not
  // appear as an empty box that answers "I don't know" in front of a judge.
  if (!grounded) return null;

  const anyDegraded = messages.some((m) => m.degraded);
  const lastId = messages[messages.length - 1]?.id;

  return (
    <section
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
      className={cn("ink-band overflow-hidden rounded-2xl", className)}
    >
      {/* -- header ------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5 px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="eyebrow text-ink-muted">Ask</p>
          <h2
            id={headingId}
            className="display mt-2.5 text-2xl font-semibold sm:text-[1.75rem]"
          >
            Ask about this plan.
          </h2>
          <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-muted">
            Answers are written from your own audit and the public{" "}
            {NEXT_TERM_LABEL} schedule of classes. Nothing else.
          </p>
        </div>

        {/* The readout. Institutional counts in `.data`, so the panel states
            what it is grounded in instead of claiming to be intelligent. */}
        {/* Zero-valued stats are dropped rather than printed. On the diagnosis
            screen no schedule has been built yet, so `sections` is genuinely 0
            — and a readout that says "SECTIONS 0" next to three other live
            counts reads as a broken widget, not as an honest zero. */}
        <dl className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          {(
            [
              ["Requirements", facts.requirements],
              ["Blockers", facts.blockers],
              ["Skills", facts.skills],
              ["Sections", facts.sections],
            ] as const
          )
            .filter(([, value]) => value > 0)
            .map(([label, value]) => (
              <Stat key={label} label={label} value={value} />
            ))}
        </dl>
      </div>

      {/* -- suggested questions, built from this student's data ----------- */}
      {questions.length > 0 && (
        <div className="border-t border-ink-rule/70 px-5 py-4 sm:px-6">
          <p className="eyebrow text-ink-muted">
            {messages.length === 0 ? "Start here" : "Ask another"}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {questions.map((q) => (
              <li key={q} className="min-w-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send(q)}
                  className={cn(
                    "group inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-ink-rule bg-ink-2 py-2 pr-3 pl-3.5 text-left text-[0.8125rem] leading-snug text-ink-fg transition-colors",
                    "hover:border-ink-fg/40 hover:bg-ink-rule/60",
                    "disabled:opacity-50",
                    FOCUS,
                  )}
                >
                  <span className="min-w-0">
                    <Grounded text={q} />
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* -- transcript --------------------------------------------------- */}
      {open && (
        <div
          ref={transcriptRef}
          className="max-h-96 overflow-y-auto border-t border-ink-rule/70"
        >
          {messages.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted sm:px-6">
              Nothing asked yet. Pick a question above, or type your own below.
            </p>
          ) : (
            <ol className="divide-y divide-ink-rule/50">
              {messages.map((m) => (
                <li key={m.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="eyebrow text-ink-muted">
                      {m.role === "user" ? "You" : "Reverse Audit"}
                    </p>
                    {m.degraded && (
                      <span className="rounded-full border border-ink-rule px-2 py-0.5 text-[0.6875rem] text-ink-muted">
                        answered from your data
                      </span>
                    )}
                  </div>

                  {m.pending && m.content === "" ? (
                    <p className="mt-2 flex items-center gap-2 text-[0.9375rem] text-ink-muted">
                      <span
                        aria-hidden
                        className="inline-block size-2 animate-pulse rounded-full bg-ink-muted"
                      />
                      Reading your audit
                    </p>
                  ) : (
                    <p
                      className={cn(
                        "mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap",
                        m.role === "user" ? "text-ink-muted" : "text-ink-fg",
                      )}
                    >
                      <Grounded text={m.content} />
                      {busy && m.id === lastId && m.content !== "" && (
                        <span
                          aria-hidden
                          className="ml-0.5 inline-block h-[1.05em] w-[0.45em] translate-y-[0.15em] animate-pulse bg-ink-fg/80"
                        />
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* -- composer ----------------------------------------------------- */}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 border-t border-ink-rule px-5 py-4 sm:px-6"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              Ask a question about your {NEXT_TERM_LABEL} plan
            </label>
            <input
              id={inputId}
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_INPUT_CHARS}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Ask about a course, a blocker or an option"
              className={cn(
                "h-10 w-full min-w-0 rounded-lg border border-ink-rule bg-ink-2 px-3 text-[0.9375rem] text-ink-fg",
                "placeholder:text-ink-muted",
                FOCUS,
              )}
            />
          </div>

          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-ink-rule bg-ink-2 px-3.5 text-sm font-medium text-ink-fg",
                "hover:border-ink-fg/40",
                FOCUS,
              )}
            >
              <Square aria-hidden className="size-3 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={input.trim() === ""}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink-fg px-4 text-sm font-semibold text-ink transition-opacity",
                "hover:opacity-90 disabled:opacity-40",
                FOCUS,
              )}
            >
              Ask
              <CornerDownLeft aria-hidden className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={close}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-rule text-ink-muted",
              "hover:border-ink-fg/40 hover:text-ink-fg",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Close the assistant</span>
          </button>
        </form>
      ) : (
        <div className="border-t border-ink-rule px-5 py-4 sm:px-6">
          <button
            type="button"
            ref={openerRef}
            onClick={() => {
              focusInputNext.current = true;
              setOpen(true);
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-rule bg-ink-2 px-4 text-sm font-medium text-ink-fg transition-colors",
              "hover:border-ink-fg/40 hover:bg-ink-rule/60",
              FOCUS,
            )}
          >
            Ask your own question
            <ArrowRight aria-hidden className="size-3.5 text-ink-muted" />
          </button>
        </div>
      )}

      {/* -- provenance, always visible ----------------------------------- */}
      <p className="border-t border-ink-rule/70 px-5 py-3.5 text-xs leading-relaxed text-ink-muted sm:px-6">
        Generated from your own degree audit and the public course catalog.{" "}
        {anyDegraded
          ? "Some answers here were written straight from your data rather than by the model, and are true either way. "
          : ""}
        Not an official degree audit. Confirm with your advisor before you
        register.
      </p>

      {/* Announced once per answer rather than once per streamed token, which
          is what putting aria-live on the transcript itself would do. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-ink-muted">{label}</dt>
      <dd className="data mt-1.5 text-lg leading-none font-medium text-ink-fg">
        {value}
      </dd>
    </div>
  );
}
