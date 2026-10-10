import type { Metadata } from "next";
// Self-hosted: the font files ship inside the `geist` package, so the build and the running site never
// contact Google (next/font/google downloads them during the build, which breaks offline or locked-down builds).
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = GeistSans; // exposes the --font-geist-sans CSS variable
const geistMono = GeistMono; // exposes the --font-geist-mono CSS variable

const appUrl = process.env.APP_URL?.trim();

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: "Aurum Desk - XAU/USD & BTC/USD",
  description: "Chart and measured, rule-based setups for gold and Bitcoin. Educational only; not investment advice.",
  openGraph: {
    title: "Aurum Desk - XAU/USD & BTC/USD",
    description: "Chart and measured, rule-based setups for gold and Bitcoin. Educational only; not investment advice.",
    type: "website",
  },
};

// Runs before first paint so the saved theme never flashes the wrong colours.
const THEME_SCRIPT = `try{var t=localStorage.getItem("aurum-theme");var d=t==="dark"||((t!=="light")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col"><AppShell>{children}</AppShell></body>
    </html>
  );
}
