import type { Bottleneck } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The dependency chain behind a bottleneck, as static inline SVG.
 *
 * CLAUDE.md §13: "A registrar's mental model of a curriculum literally *is*
 * that graph." Bottleneck.chainDepth and Bottleneck.dependents are already in
 * the frozen contract and §11.1 already computes the longest path, so shipping
 * only the string "3 courses depend on it" throws the render away.
 *
 * No graph library and no layout engine — §13 says hardcode horizontal
 * positions from chainDepth, and that is exactly what NODE_W/GAP do below.
 * Everything is derived from props; nothing here is hardcoded per course.
 *
 * Honesty note on what the edges mean: `dependents` is the TRANSITIVE set of
 * still-needed courses reachable from this one (§11.1), not an ordered path. So
 * the left-to-right reading is "everything to the right is still waiting on
 * this course", which is true by construction, and the caption says so in
 * words. We are not claiming each arrow is a single catalog prerequisite.
 */

const NODE_W = 150;
const NODE_H = 62;
const GAP = 42;
const PAD = 10;
const NODE_Y = 34;
const MAX_NODES = 4;

type NodeKind = "done" | "head" | "blocked";

interface ChainNode {
  code: string;
  title: string;
  kind: NodeKind;
}

/** SVG cannot ellipsis text in CSS, so titles are clipped here with a tooltip. */
function clip(text: string, max = 22) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The text equivalent of the drawing, for anyone who cannot see it.
 *
 * WCAG 2.1 AA: a graphic that carries meaning needs the same meaning in words.
 * It is one sentence rather than a node-by-node reading because the ordering
 * left to right is the whole content of the picture. The root <svg> carries
 * role="img", so assistive technology reads this label and skips the per-node
 * <title> tooltips instead of announcing both.
 */
function chainDescription(
  bottleneck: Bottleneck,
  upstream: string | undefined,
): string {
  const head = upstream
    ? `You have already finished ${upstream}. ${bottleneck.code} ${bottleneck.title} comes next.`
    : `${bottleneck.code} ${bottleneck.title} sits at the head of it.`;
  const waiting =
    bottleneck.dependents.length === 0
      ? "Nothing you still need is waiting behind it."
      : `${bottleneck.dependents.length} ${
          bottleneck.dependents.length === 1 ? "course" : "courses"
        } you still need cannot be taken until it is done: ${bottleneck.dependents.join(", ")}.`;
  return `Prerequisite chain. ${head} ${waiting}`;
}

export interface PrereqChainProps {
  bottleneck: Bottleneck;
  /** course code → title. Nodes fall back to the bare code without it. */
  titles?: Record<string, string>;
  /** Direct prerequisites the student has already cleared, for left context. */
  completedPrereqs?: string[];
  className?: string;
}

export function PrereqChain({
  bottleneck,
  titles = {},
  completedPrereqs = [],
  className,
}: PrereqChainProps) {
  const titleOf = (code: string) => titles[code] ?? "";

  const upstream = completedPrereqs[0];
  const downstreamRoom = MAX_NODES - 1 - (upstream ? 1 : 0);
  const shown = bottleneck.dependents.slice(0, downstreamRoom);
  const hidden = bottleneck.dependents.length - shown.length;

  const nodes: ChainNode[] = [
    ...(upstream
      ? [{ code: upstream, title: titleOf(upstream), kind: "done" as const }]
      : []),
    { code: bottleneck.code, title: bottleneck.title, kind: "head" as const },
    ...shown.map((code) => ({
      code,
      title: titleOf(code),
      kind: "blocked" as const,
    })),
  ];

  const accent =
    bottleneck.urgency === "critical" ? "var(--critical)" : "var(--soon)";
  const accentSoft =
    bottleneck.urgency === "critical"
      ? "var(--critical-soft)"
      : "var(--soon-soft)";

  const width = PAD * 2 + nodes.length * NODE_W + (nodes.length - 1) * GAP;
  const height = NODE_Y + NODE_H + 34;
  const xOf = (i: number) => PAD + i * (NODE_W + GAP);

  return (
    <figure className={cn("m-0", className)}>
      {/*
        A scrollable region must be reachable by keyboard (WCAG 2.1.1) — axe
        flags this "serious" otherwise, because a sighted keyboard user on a
        narrow viewport cannot pan the chain. tabIndex 0 plus a name and a role
        makes it a real, announced, focusable region. The SVG inside keeps its
        own aria-label, which is the text equivalent of the whole diagram.
      */}
      <div
        className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        tabIndex={0}
        role="group"
        aria-label="Prerequisite chain, scrollable"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={chainDescription(bottleneck, upstream)}
          // min-w only below sm. Measured: an unconditional min-w-[520px] made
          // the SVG 520px inside a 505px card, so the last node rendered
          // half-clipped at the card edge on the screen the video dwells on.
          // From sm up the viewBox scales the whole chain to fit; below sm the
          // min-width keeps the node labels readable and the wrapper scrolls.
          className="block w-full min-w-[520px] sm:min-w-0"
        >
          <defs>
            <marker
              id={`ra-arrow-${bottleneck.code.replace(/\s/g, "")}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L7.5,4 L0,7.5 Z" fill={accent} />
            </marker>
          </defs>

          {nodes.slice(0, -1).map((node, i) => {
            const from = xOf(i) + NODE_W;
            const to = xOf(i + 1) - 3;
            const y = NODE_Y + NODE_H / 2;
            const done = node.kind === "done";
            return (
              <line
                key={`edge-${node.code}`}
                x1={from + 6}
                y1={y}
                x2={to}
                y2={y}
                stroke={done ? "var(--rule)" : accent}
                strokeWidth={done ? 1.5 : 2}
                strokeDasharray={done ? "4 4" : undefined}
                markerEnd={
                  done
                    ? undefined
                    : `url(#ra-arrow-${bottleneck.code.replace(/\s/g, "")})`
                }
              />
            );
          })}

          {nodes.map((node, i) => {
            const x = xOf(i);
            const head = node.kind === "head";
            const done = node.kind === "done";
            return (
              <g key={node.code}>
                {/* One string, not a fragment: React refuses array children on
                    <title> because the DOM flattens them to a single text node. */}
                <title>{node.title ? `${node.code} — ${node.title}` : node.code}</title>

                {/* 11px, not 9.5: this row is the only thing on the drawing
                    that says what each box means, and at 9.5 it read as
                    decoration. "CAN'T TAKE YET" rather than "BLOCKED" — a
                    student has no reason to know that blocked is a graph term
                    and not a hold on their account. */}
                <text
                  x={x + NODE_W / 2}
                  y={NODE_Y - 13}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.09em"
                  fill={done ? "var(--muted-foreground)" : head ? accent : "var(--muted-foreground)"}
                >
                  {done ? "DONE" : head ? "TAKE THIS TERM" : "CAN'T TAKE YET"}
                </text>

                <rect
                  x={x}
                  y={NODE_Y}
                  width={NODE_W}
                  height={NODE_H}
                  rx="10"
                  fill={head ? accentSoft : done ? "transparent" : "var(--card)"}
                  stroke={done ? "var(--rule)" : accent}
                  strokeWidth={head ? 2 : 1}
                  strokeDasharray={done ? "5 4" : undefined}
                  strokeOpacity={done ? 1 : head ? 1 : 0.45}
                />

                {/* font-mono as a class, not a fontFamily string: globals.css
                    declares the token with `@theme inline`, which inlines it
                    into the utility instead of emitting --font-mono at :root. */}
                <text
                  x={x + 14}
                  y={NODE_Y + 26}
                  fontSize="14.5"
                  fontWeight="600"
                  className="font-mono"
                  fill={done ? "var(--muted-foreground)" : "var(--foreground)"}
                >
                  {node.code}
                </text>
                <text
                  x={x + 14}
                  y={NODE_Y + 45}
                  fontSize="10.5"
                  fill="var(--muted-foreground)"
                >
                  {clip(node.title)}
                </text>
              </g>
            );
          })}

          {hidden > 0 && (
            <text
              x={width - PAD}
              y={NODE_Y + NODE_H + 22}
              textAnchor="end"
              fontSize="10.5"
              fill="var(--muted-foreground)"
            >
              {`+ ${hidden} more still behind ${bottleneck.code}`}
            </text>
          )}
        </svg>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        Everything to the right is a course you still need and cannot reach until{" "}
        <span className="font-mono font-medium text-foreground">
          {bottleneck.code}
        </span>{" "}
        is done. Chain read from the published prerequisites.
      </figcaption>
    </figure>
  );
}
