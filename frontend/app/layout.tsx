import type { Metadata } from "next";
import { DM_Sans, Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const siteDescription =
  "A full-stack research workspace with hybrid RAG retrieval and citations that open the exact source PDF page.";

export const metadata: Metadata = {
  metadataBase: new URL("https://recall-research-workspace-demo.vercel.app"),
  title: "Recall — Your Research, Remembered",
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName: "Recall",
    title: "Recall — Research answers you can trace to the source",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Recall — Research answers you can trace to the source",
    description: siteDescription,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
