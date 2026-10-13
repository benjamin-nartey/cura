import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@curasphere/design-system/system.css";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: "400",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CuraSphere",
  description: "Clinician workspace. Source records stay authoritative. Derived briefings cite those records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={sans.className}>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <div className="notice">CuraSphere · one chart for the people in this clinic’s care.</div>
        {children}
      </body>
    </html>
  );
}
