import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// app/globals.css maps --font-sans and --font-mono in its @theme block, so the
// CSS variable names here have to match those exactly or `font-sans` resolves to
// nothing. Tailwind v4 has no config file to catch this for us (CLAUDE.md §6).
//
// TYPE SYSTEM. Geist was the create-next-app default and it is the reason every
// screen read as a template: it is the same face half the web ships. Instrument
// Sans is tighter and more editorial, holds up at display sizes without looking
// like a landing page, and stays serious enough for a registrar.
const sans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Every number in this product is institutional data a student will copy by
// hand: CRNs, course codes, credit hours, meeting times. Those belong in a mono
// face, and setting them in one makes the whole app read as an instrument
// rather than as marketing. IBM Plex Mono has real character and pairs cleanly.
const mono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
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
