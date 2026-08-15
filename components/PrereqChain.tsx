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
 * positions from chainDepth, and that is exactly what the geometry table below
 * does. Everything is derived from props; nothing here is hardcoded per course.
 *
 * TWO SURFACES. `surface="paper"` is the original light rendering and stays the
 * default, so any other caller is untouched. `surface="ink"` draws the same
 * graph on the dark analysis band at roughly a third larger, because on the
 * diagnosis screen this drawing IS the screen rather than a footnote inside a
 * card. Only geometry and colour change — the node model, the reading order and
 * the text equivalent are identical on both.
 *
 * Honesty note on what the edges mean: `dependents` is the TRANSITIVE set of
 * still-needed courses reachable from this one (§11.1), not an ordered path. So
 * the left-to-right reading is "everything to the right is still waiting on
 * this course", which is true by construction, and the caption says so in
 * words. We are not claiming each arrow is a single catalog prerequisite.
 */

export type ChainSurface = "paper" | "ink";

interface Geometry {
  nodeW: number;
  nodeH: number;
  gap: number;
  pad: number;
  /** Top of the node box; the state label sits above it. */
  nodeY: number;
  /** Room under the node box for the "+n more" note. */
  below: number;
  labelSize: number;
  codeSize: number;
  titleSize: number;
  noteSize: number;
  /** SVG cannot ellipsis text in CSS, so titles are clipped at this length. */
  clipAt: number;
}

const GEOMETRY: Record<ChainSurface, Geometry> = {
  paper: {
    nodeW: 150,
    nodeH: 62,
    gap: 42,
    pad: 10,
    nodeY: 34,
    below: 34,
    labelSize: 11,
    codeSize: 14.5,
    titleSize: 10.5,
    noteSize: 10.5,
    clipAt: 22,
  },
  ink: {
    nodeW: 200,
    nodeH: 92,
    gap: 60,
    pad: 14,
    nodeY: 48,
    below: 46,
    labelSize: 12,
    codeSize: 19,
    titleSize: 12.5,
    noteSize: 12,
    clipAt: 26,
  },
};

/**
 * An ink chain scales to its band, but a two-node chain in a 1100px band would
 * otherwise render course codes at 40px. Cap the upscale and let the drawing sit
 * left-aligned in the band instead of ballooning.
 */
const INK_MAX_SCALE = 1.3;

const MAX_NODES = 4;

/** Urgency is the only thing that picks a hue. Never decorative. */
const ACCENT: Record<Bottleneck["urgency"], { solid: string; soft: string }> = {
  critical: { solid: "var(--critical)", soft: "var(--critical-soft)" },
  soon: { solid: "var(--soon)", soft: "var(--soon-soft)" },
  flexible: { solid: "var(--calm)", soft: "var(--calm-soft)" },
};

/**
 * On paper the accent is the ink-dark hue and the surface is white. On the dark
 * band that inverts: the -soft tint is the readable "urgent" colour (it measures
 * ~11:1 on --ink, where the solid measures 2.5:1 and must never carry text), and
 * the solid is used only as text ON a soft fill, which is the same pairing the
 * paper chips already use.
 */
function palette(surface: ChainSurface, urgency: Bottleneck["urgency"]) {
  const accent = ACCENT[urgency];
  if (surface === "ink") {
    return {
      edge: accent.soft,
      doneEdge: "var(--ink-rule)",
      headFill: accent.soft,
      headStroke: accent.soft,
      headCode: accent.solid,
      headTitle: accent.solid,
      headLabel: accent.soft,
      blockedFill: "var(--ink-2)",
      blockedStroke: accent.soft,
      blockedStrokeOpacity: 0.45,
      code: "var(--ink-fg)",
      title: "var(--ink-muted)",
      muted: "var(--ink-muted)",
      doneStroke: "var(--ink-rule)",
    };
  }
  return {
    edge: accent.solid,
    doneEdge: "var(--rule)",
    headFill: accent.soft,
    headStroke: accent.solid,
    headCode: "var(--foreground)",
    headTitle: "var(--muted-foreground)",
    headLabel: accent.solid,
    blockedFill: "var(--card)",
    blockedStroke: accent.solid,
    blockedStrokeOpacity: 0.45,
    code: "var(--foreground)",
    title: "var(--muted-foreground)",
    muted: "var(--muted-foreground)",
    doneStroke: "var(--rule)",
  };
}

type NodeKind = "done" | "head" | "blocked";

interface ChainNode {
  code: string;
  title: string;
  kind: NodeKind;
}

function clip(text: string, max: number) {
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
  /**
   * "paper" (default) is the original light rendering — unchanged, so existing
   * callers keep working. "ink" draws the chain larger for the dark band.
   */
  surface?: ChainSurface;
  className?: string;
}

export function PrereqChain({
  bottleneck,
  titles = {},
  completedPrereqs = [],
  surface = "paper",
  className,
}: PrereqChainProps) {
  const g = GEOMETRY[surface];
  const c = palette(surface, bottleneck.urgency);
  const ink = surface === "ink";
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

  const width = g.pad * 2 + nodes.length * g.nodeW + (nodes.length - 1) * g.gap;
  const height = g.nodeY + g.nodeH + g.below;
  const xOf = (i: number) => g.pad + i * (g.nodeW + g.gap);
  const markerId = `ra-arrow-${surface}-${bottleneck.code.replace(/\s/g, "")}`;

  return (
    <figure className={cn("m-0", className)}>
      {/*
        A scrollable region must be reachable by keyboard (WCAG 2.1.1) — axe
        flags this "serious" otherwise, because a sighted keyboard user on a
        narrow viewport cannot pan the chain. tabIndex 0 plus a name and a role
        makes it a real, announced, focusable region. The SVG inside keeps its
        own aria-label, which is the text equivalent of the whole diagram.

        The focus ring has to change with the surface: --ring is a mid grey that
        is invisible against --ink.
      */}
      <div
        className={cn(
          "overflow-x-auto focus-visible:ring-2 focus-visible:outline-none",
          ink ? "focus-visible:ring-ink-fg" : "focus-visible:ring-ring",
        )}
        tabIndex={0}
        role="group"
        aria-label="Prerequisite chain, scrollable"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label={chainDescription(bottleneck, upstream)}
          // min-w only below sm. Measured: an unconditional min-w made the SVG
          // wider than its card, so the last node rendered half-clipped at the
          // card edge on the screen the video dwells on. From sm up the viewBox
          // scales the whole chain to fit; below sm the min-width keeps the node
          // labels readable and the wrapper scrolls.
          className={cn(
            "block w-full sm:min-w-0",
            ink ? "min-w-[620px]" : "min-w-[520px]",
          )}
          style={ink ? { maxWidth: Math.round(width * INK_MAX_SCALE) } : undefined}
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L7.5,4 L0,7.5 Z" fill={c.edge} />
            </marker>
          </defs>

          {nodes.slice(0, -1).map((node, i) => {
            const from = xOf(i) + g.nodeW;
            const to = xOf(i + 1) - 3;
            const y = g.nodeY + g.nodeH / 2;
            const done = node.kind === "done";
            return (
              <line
                key={`edge-${node.code}`}
                x1={from + 6}
                y1={y}
                x2={to}
                y2={y}
                stroke={done ? c.doneEdge : c.edge}
                strokeWidth={done ? 1.5 : ink ? 2.5 : 2}
                strokeDasharray={done ? "4 4" : undefined}
                markerEnd={done ? undefined : `url(#${markerId})`}
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
                <title>{node.title ? `${node.code} · ${node.title}` : node.code}</title>

                {/* This row is the only thing on the drawing that says what each
                    box means. "CAN'T TAKE YET" rather than "BLOCKED" — a student
                    has no reason to know that blocked is a graph term and not a
                    hold on their account. */}
                <text
                  x={x + g.nodeW / 2}
                  y={g.nodeY - (ink ? 16 : 13)}
                  textAnchor="middle"
                  fontSize={g.labelSize}
                  fontWeight="600"
                  letterSpacing="0.09em"
                  fill={head ? c.headLabel : c.muted}
                >
                  {done ? "DONE" : head ? "TAKE THIS TERM" : "CAN'T TAKE YET"}
                </text>

                <rect
                  x={x}
                  y={g.nodeY}
                  width={g.nodeW}
                  height={g.nodeH}
                  rx={ink ? 12 : 10}
                  fill={head ? c.headFill : done ? "transparent" : c.blockedFill}
                  stroke={done ? c.doneStroke : head ? c.headStroke : c.blockedStroke}
                  strokeWidth={head ? 2 : 1}
                  strokeDasharray={done ? "5 4" : undefined}
                  strokeOpacity={done || head ? 1 : c.blockedStrokeOpacity}
                />

                {/* .data is the mono + tabular-figure class from globals.css.
                    Every course code in the product is set in it, including the
                    ones inside this drawing — they are the same institutional
                    strings a student copies into Patriot Web. */}
                <text
                  x={x + (ink ? 18 : 14)}
                  y={g.nodeY + (ink ? 38 : 26)}
                  fontSize={g.codeSize}
                  fontWeight="600"
                  className="data"
                  fill={head ? c.headCode : done ? c.muted : c.code}
                >
                  {node.code}
                </text>
                <text
                  x={x + (ink ? 18 : 14)}
                  y={g.nodeY + (ink ? 63 : 45)}
                  fontSize={g.titleSize}
                  fill={head ? c.headTitle : done ? c.muted : c.title}
                >
                  {clip(node.title, g.clipAt)}
                </text>
              </g>
            );
          })}

          {hidden > 0 && (
            <text
              x={g.pad}
              y={g.nodeY + g.nodeH + g.noteSize * 2}
              fontSize={g.noteSize}
              fill={c.muted}
            >
              {`+ ${hidden} more still behind ${bottleneck.code}`}
            </text>
          )}
        </svg>
      </div>
      <figcaption
        className={cn(
          "mt-3 leading-relaxed",
          ink ? "text-sm text-ink-muted" : "text-xs text-muted-foreground",
        )}
      >
        Everything to the right is a course you still need and cannot reach until{" "}
        <span
          className={cn("data font-medium", ink ? "text-ink-fg" : "text-foreground")}
        >
          {bottleneck.code}
        </span>{" "}
        is done. Chain read from the published prerequisites.
      </figcaption>
    </figure>
  );
}
