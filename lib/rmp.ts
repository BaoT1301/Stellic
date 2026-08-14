// See CLAUDE.md §11.4 and §5.
//
// We NEVER fetch this URL. We render it as a link the student's own browser
// follows. No scraping, no ToS problem, and better product design — we aren't
// asserting a rating, we're saying "go look."

export function rmpUrl(instructor: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(instructor)}`;
}
