/**
 * Asserts the palette in app/globals.css against WCAG 2.1 AA, and against the
 * sRGB gamut.
 *
 * CLAUDE.md §3 puts registrars and provosts in the judging room, and ADA Title II
 * makes WCAG 2.1 AA the technical standard for public institutions — so the
 * contrast claims written into globals.css's comments need to be measured rather
 * than reasoned about. The palette was retuned for chroma (every "-soft" fill
 * moved from L~0.966 to L~0.945 and roughly doubled in chroma), and raising the
 * chroma of a fill LOWERS its contrast with the text sitting on it. This is the
 * check that catches that.
 *
 * Also checks gamut: oklch lets you write a chroma that does not exist in sRGB at
 * a given lightness and hue. The browser silently clips it, so a colour can look
 * fine and still not be the colour in the file — and two clipped colours can
 * collapse into the same rendered value.
 *
 *   npx tsx scripts/check-contrast.ts
 *
 * Exits non-zero on any failure, so a bad palette is not committable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// tsx compiles this to CJS, so no top-level await and no import.meta. Scripts are
// run from the repo root (CLAUDE.md §7: `npx tsx scripts/x.ts`).
const CSS = join(process.cwd(), "app", "globals.css");

// ---------------------------------------------------------------------------
// oklch -> linear sRGB -> relative luminance
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };

/** Björn Ottosson's OKLab -> linear sRGB matrices. */
function oklchToLinearRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** WCAG relative luminance. Linear-light sRGB is already what the formula wants. */
function luminance({ r, g, b }: Rgb): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** How far outside sRGB a colour sits. 0 means in gamut. */
function gamutError({ r, g, b }: Rgb): number {
  return Math.max(0, -r, -g, -b, r - 1, g - 1, b - 1);
}

// ---------------------------------------------------------------------------
// Read the tokens straight out of globals.css, so this cannot drift from it
// ---------------------------------------------------------------------------

const source = readFileSync(CSS, "utf8");

/** `--critical: oklch(0.52 0.205 27);` -> ["critical", {L,C,H}] */
const tokens = new Map<string, Rgb>();
const raw = new Map<string, string>();

for (const m of source.matchAll(
  /^\s*--([a-z0-9-]+):\s*oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)\s*;/gim,
)) {
  const [, name, l, c, h] = m;
  if (tokens.has(name!)) continue; // first definition wins; .dark is later and unused
  tokens.set(name!, oklchToLinearRgb(Number(l), Number(c), Number(h)));
  raw.set(name!, `oklch(${l} ${c} ${h})`);
}

function get(name: string): Rgb {
  const t = tokens.get(name);
  if (!t) throw new Error(`token --${name} not found in app/globals.css`);
  return t;
}

// ---------------------------------------------------------------------------
// The assertions
// ---------------------------------------------------------------------------

/** SC 1.4.3: 4.5:1 for normal text. SC 1.4.11: 3:1 for UI state / boundaries. */
type Check = { fg: string; bg: string; min: number; note: string };

const SURFACES = ["canvas", "card", "muted"];

const checks: Check[] = [
  // Body and explanatory text on all three surfaces a screen actually uses.
  ...SURFACES.map((bg) => ({
    fg: "foreground",
    bg,
    min: 4.5,
    note: "body text",
  })),
  ...SURFACES.map((bg) => ({
    fg: "muted-foreground",
    bg,
    min: 4.5,
    note: "explanatory text — carries most strings in the app",
  })),

  // Each semantic solid as text, on the canvas AND on its own soft fill. The
  // second half is the one the chroma bump put at risk.
  ...["brand", "critical", "soon", "calm", "covered", "missing"].flatMap((k) => [
    { fg: k, bg: "canvas", min: 4.5, note: `${k} text on canvas` },
    { fg: k, bg: "card", min: 4.5, note: `${k} text on a card` },
    { fg: k, bg: `${k}-soft`, min: 4.5, note: `${k} text on its own tint` },
  ]),

  // The primary CTA moved from near-black to brand blue. BOTH states are
  // checked: the hover fill is where the regression actually landed, because
  // shadcn's stock `hover:bg-primary/80` composites toward the page.
  {
    fg: "primary-foreground",
    bg: "primary",
    min: 4.5,
    note: "primary button label, at rest",
  },
  {
    fg: "primary-foreground",
    bg: "primary-hover",
    min: 4.5,
    note: "primary button label, on hover",
  },

  // SC 1.4.11 — focus ring, and the hairline that separates a card from paper.
  { fg: "ring", bg: "canvas", min: 3, note: "focus ring (SC 1.4.11)" },
  { fg: "ring", bg: "card", min: 3, note: "focus ring on a card (SC 1.4.11)" },
];

let failed = 0;
const rows: string[] = [];

for (const { fg, bg, min, note } of checks) {
  const ratio = contrast(get(fg), get(bg));
  const ok = ratio >= min;
  if (!ok) failed++;
  rows.push(
    `${ok ? "  ok  " : "  FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  --${fg} on --${bg}  · ${note}`,
  );
}

console.log("Contrast\n" + rows.join("\n"));

// Gamut.
const outOfGamut: string[] = [];
for (const [name, rgb] of tokens) {
  const err = gamutError(rgb);
  if (err > 0.001) {
    outOfGamut.push(`  FAIL  --${name}: ${raw.get(name)} is ${err.toFixed(3)} outside sRGB`);
  }
}
console.log(
  "\nGamut\n" +
    (outOfGamut.length ? outOfGamut.join("\n") : `  ok    all ${tokens.size} tokens are inside sRGB`),
);
failed += outOfGamut.length;

// The soft fills must be visibly distinct from the canvas they sit on, or the
// colour coding the legend promises is not actually delivered. 1.06:1 is about
// the floor at which a large tinted panel reads as tinted rather than as paper.
const fillRows: string[] = [];
for (const k of ["brand", "critical", "soon", "calm", "covered", "missing"]) {
  const ratio = contrast(get(`${k}-soft`), get("canvas"));
  const ok = ratio >= 1.06;
  if (!ok) failed++;
  fillRows.push(
    `${ok ? "  ok  " : "  FAIL"}  ${ratio.toFixed(3)}:1  --${k}-soft vs --canvas`,
  );
}
console.log("\nFill separation from canvas\n" + fillRows.join("\n"));

console.log(
  failed === 0
    ? "\nPALETTE CLEAN\n"
    : `\n${failed} FAILURE(S)\n`,
);
process.exit(failed === 0 ? 0 : 1);
