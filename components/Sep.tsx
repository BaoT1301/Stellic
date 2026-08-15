/**
 * A hairline between two items in a readout row.
 *
 * This replaces the middot, which the app used as its universal separator in 24
 * places — in stat lines, inside prose, between a course code and an instructor
 * name, and as a list bullet. One glyph doing four jobs is why it read as a tic
 * rather than as a device.
 *
 * A rule is the right answer for the one job worth keeping: separating the
 * countable facts in a run like "15 cr | 2 of 3 slots | unblocks 2 courses", so
 * it reads as an instrument panel rather than as a sentence. Everywhere the
 * middot was sitting inside actual prose it is now punctuation, and where it was
 * a bullet it is now a real list marker.
 *
 * aria-hidden and drawn with a background rather than a character, so it is
 * never announced and never selected when a student copies the line.
 *
 * Intended use:
 *
 *   <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
 *     <span>15 credits</span>
 *     <Sep />
 *     <span>2 of 3 elective slots</span>
 *   </p>
 */
export function Sep() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-rule" />;
}
