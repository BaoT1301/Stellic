import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// app/globals.css maps --font-sans and --font-mono in its @theme block, so the
// CSS variable names here have to match those exactly or `font-sans` resolves to
// nothing. Tailwind v4 has no config file to catch this for us (CLAUDE.md §6).
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
