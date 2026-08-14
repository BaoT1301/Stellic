import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. There is a stray package-lock.json in a parent
  // directory (~/Downloads), and without this Turbopack infers that as the root
  // and warns on every build. Pinning it also keeps local and Vercel builds
  // resolving modules from the same place.
  turbopack: { root: __dirname },
};

export default nextConfig;
