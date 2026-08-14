// See CLAUDE.md §6. Hit this on the LIVE Vercel URL on day 1.
// A missing env var in the Vercel dashboard is the single most likely day-1
// deploy mistake, precisely because .env.local is gitignored.

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    hasKey: !!process.env.OPENAI_API_KEY,
  });
}
