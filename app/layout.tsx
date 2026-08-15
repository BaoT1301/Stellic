import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * TWO families, doing two different jobs.
 *
 * Geist sets the prose: headings, ledes, explanatory copy, buttons. Geist Mono
 * sets the machine-readable strings — course codes, CRNs, meeting times, the
 * diff line on a schedule card. That split is the point: a CRN is a number a
 * student copies into a registration form character by character, and it should
 * not look like the sentence around it.
 *
 * This replaces a single-family setup where --font-sans and --font-mono both
 * resolved to JetBrains Mono, which made every `font-mono` utility in the app a
 * no-op. Those ~20 call sites are now real font switches again, which is why
 * none of them needed editing.
 *
 * The variable names have to match what globals.css reads in its @theme block or
 * `font-sans` silently resolves to nothing. Tailwind v4 has no config file to
 * catch this for us (CLAUDE.md §6).
 *
 * No `weight` arrays: both are variable fonts on Google Fonts, and listing
 * weights would ship several static instances instead of one axis.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reverse Audit — build next semester from the job you want",
  description:
    "Tell it the job you want. Reverse Audit reads your degree audit against the public course catalog and schedule of classes, finds the requirements that are actually load-bearing, and hands you a registerable schedule.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        {/* §13: the disclaimer is persistent, so it lives in the layout rather
            than in any one screen. */}
        <Footer />
        {/* §14: sonner, not the deprecated shadcn toast. theme is pinned to
            light because the app has no dark palette and no theme provider —
            left on "system" the toast renders dark on a light page for anyone
            whose OS is in dark mode. */}
        <Toaster position="bottom-center" theme="light" />
      </body>
    </html>
  );
}
