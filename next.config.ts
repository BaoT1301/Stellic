import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 wraps pdfjs, which loads `pdf.worker.mjs` at runtime by path.
  // Turbopack bundles the library into .next/server/chunks but does NOT emit
  // the worker alongside it, so a PRODUCTION build throws
  //   "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs"
  // on every upload. §12 catches it and serves the cached fixture, which meant
  // the PDF path silently never parsed anything in `next start` or on Vercel
  // while still looking like it worked. Marking the package external leaves it
  // in node_modules where its own relative worker resolution succeeds.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Pin the workspace root. There is a stray package-lock.json in a parent
  // directory (~/Downloads), and without this Turbopack infers that as the root
  // and warns on every build. Pinning it also keeps local and Vercel builds
  // resolving modules from the same place.
  turbopack: { root: __dirname },
};

export default nextConfig;
